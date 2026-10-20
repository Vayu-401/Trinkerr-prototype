"""Create demo data for local development. Safe to run twice; refuses to run when DEBUG is off."""

import os
import random
import secrets

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import Role, User, VerificationStatus
from posts.models import Post
from sharing.models import DashboardShare
from stats.tasks import aggregate_survey
from submissions.models import Response, ResponseAnswer
from surveys.models import Option, Question, QuestionType, Survey, SurveyStatus

INVESTORS = [
    ("priya@example.com", "Priya Sharma", VerificationStatus.VERIFIED),
    ("rahul@example.com", "Rahul Verma", VerificationStatus.VERIFIED),
    ("anita@example.com", "Anita Rao", VerificationStatus.VERIFIED),
    ("vikram@example.com", "Vikram Iyer", VerificationStatus.PENDING),
    ("meera@example.com", "Meera Nair", VerificationStatus.UNVERIFIED),
]
PANEL_SIZE = 70  # extra verified "panel" investors so the 3 surveys get ~200 responses in total

SURVEYS = [
    (
        "priya@example.com",
        "Where will you invest next quarter?",
        "Select all that apply.",
        [
            ("Preferred asset classes", QuestionType.MULTIPLE, ["Equity", "Mutual Funds", "Gold", "Bonds"]),
            ("How much of your portfolio will you add?", QuestionType.SINGLE, ["Under 5%", "5-15%", "Over 15%"]),
        ],
    ),
    (
        "rahul@example.com",
        "Where is the Nifty 50 headed by March?",
        "",
        [
            ("Direction", QuestionType.SINGLE, ["Up more than 10%", "Up 0-10%", "Flat", "Down"]),
            (
                "Biggest risk you see",
                QuestionType.MULTIPLE,
                ["Inflation", "Global slowdown", "Valuations", "Elections"],
            ),
            ("Your time horizon", QuestionType.SINGLE, ["Under 1 year", "1-3 years", "3+ years"]),
        ],
    ),
    (
        "anita@example.com",
        "Which sectors look strongest?",
        "Pick every sector you're overweight on.",
        [
            ("Sectors you're overweight on", QuestionType.MULTIPLE, ["Banking", "IT", "Pharma", "FMCG", "Energy"]),
            ("Do you use SIPs?", QuestionType.SINGLE, ["Yes, monthly", "Occasionally", "No"]),
        ],
    ),
]


class Command(BaseCommand):
    help = "Seed demo users, surveys, responses, posts and a share link (DEBUG only, idempotent)."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs with DEBUG=true.")
        admin_pw = os.environ.get("SEED_ADMIN_PASSWORD")
        if not admin_pw:
            raise CommandError("Set SEED_ADMIN_PASSWORD in the environment first.")
        investor_pw = os.environ.get("SEED_INVESTOR_PASSWORD", "Investor@12345")
        rng = random.Random(42)

        with transaction.atomic():
            admin, created = User.objects.get_or_create(
                email="admin@example.com",
                defaults=dict(
                    name="Admin",
                    role=Role.ADMIN,
                    verification_status=VerificationStatus.VERIFIED,
                    is_staff=True,
                    is_superuser=True,
                ),
            )
            if created:
                admin.set_password(admin_pw)
                admin.save()

            people = {}
            for email, name, status in INVESTORS:
                u, created = User.objects.get_or_create(
                    email=email, defaults=dict(name=name, verification_status=status)
                )
                if created:
                    u.set_password(investor_pw)
                    if status == VerificationStatus.VERIFIED:
                        u.verified_by, u.verified_at = admin, timezone.now()
                    u.save()
                people[email] = u

            hashed = make_password(investor_pw)
            existing = set(User.objects.filter(email__startswith="panel").values_list("email", flat=True))
            User.objects.bulk_create(
                [
                    User(
                        email=f"panel{i:02d}@example.com",
                        name=f"Panel Investor {i:02d}",
                        password=hashed,
                        verification_status=VerificationStatus.VERIFIED,
                    )
                    for i in range(1, PANEL_SIZE + 1)
                    if f"panel{i:02d}@example.com" not in existing
                ]
            )
            voters = list(User.objects.filter(verification_status=VerificationStatus.VERIFIED, role=Role.INVESTOR))

            surveys = []
            for creator_email, title, desc, questions in SURVEYS:
                survey, created = Survey.objects.get_or_create(
                    title=title,
                    creator=people[creator_email],
                    defaults=dict(description=desc, status=SurveyStatus.PUBLISHED, published_at=timezone.now()),
                )
                if created:
                    for qi, (text, qtype, opts) in enumerate(questions, 1):
                        q = Question.objects.create(survey=survey, text=text, type=qtype, position=qi)
                        Option.objects.bulk_create(
                            [Option(question=q, text=o, position=oi) for oi, o in enumerate(opts, 1)]
                        )
                surveys.append(survey)

            total = 0
            for survey in surveys:
                if survey.responses.exists():
                    continue  # already seeded
                qs = list(survey.questions.prefetch_related("options"))
                for voter in rng.sample(voters, k=min(len(voters), rng.randint(60, 72))):
                    if voter.id == survey.creator_id:
                        continue
                    resp = Response.objects.create(survey=survey, user=voter)
                    rows = []
                    for q in qs:
                        opts = list(q.options.all())
                        if q.type == QuestionType.SINGLE:
                            picks = [rng.choices(opts, weights=range(len(opts), 0, -1))[0]]
                        else:
                            picks = [o for o in opts if rng.random() < 0.45] or [rng.choice(opts)]
                        rows += [ResponseAnswer(response=resp, question=q, option=o) for o in picks]
                    ResponseAnswer.objects.bulk_create(rows)
                    total += 1

            if not Post.objects.exists():
                Post.objects.create(
                    author=people["priya@example.com"],
                    body="Gold has had a big run. I'm trimming and moving into short-term bonds.",
                    survey=surveys[0],
                )
                Post.objects.create(
                    author=people["rahul@example.com"],
                    body="Valuations worry me more than rates right now. Curious what everyone thinks.",
                    survey=surveys[1],
                )

            share = DashboardShare.objects.filter(user=people["priya@example.com"], revoked_at__isnull=True).first()
            if share is None:
                share = DashboardShare.objects.create(user=people["priya@example.com"], token=secrets.token_urlsafe(32))

        for s in surveys:  # run the aggregation synchronously so stats exist immediately
            aggregate_survey(str(s.id))

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded. New responses: {total}. Admin: admin@example.com. Investors use SEED_INVESTOR_PASSWORD "
                f"(default Investor@12345). Shared dashboard: {share.url}"
            )
        )
