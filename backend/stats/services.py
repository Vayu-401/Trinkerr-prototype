from datetime import timedelta

from django.db.models import Count
from django.db.models.functions import TruncMonth
from django.utils import timezone

from submissions.models import Response
from surveys.models import Survey, SurveyStatus

from .models import OptionStats, SurveyStats


def percentage(count: int, participants: int) -> float:
    return round(count * 100 / participants, 1) if participants else 0.0


def build_results(survey):
    """`survey` must be loaded with prefetch_related("questions__options")."""
    stats = SurveyStats.objects.filter(survey=survey).first()
    participants = stats.participant_count if stats else 0
    counts = dict(OptionStats.objects.filter(survey=survey).values_list("option_id", "selection_count"))

    questions = []
    for q in survey.questions.all():
        options = []
        for o in q.options.all():
            c = counts.get(o.id, 0)
            options.append(
                {"id": str(o.id), "text": o.text, "selection_count": c, "percentage": percentage(c, participants)}
            )
        questions.append({"id": str(q.id), "text": q.text, "type": q.type, "options": options})

    return {
        "survey_id": str(survey.id),
        "title": survey.title,
        "status": survey.status,
        "participant_count": participants,
        "pending_responses": Response.objects.filter(survey=survey, processed_at__isnull=True).count(),
        "stats_updated_at": stats.updated_at if stats else None,
        "questions": questions,
    }


def build_dashboard(user, *, include_history: bool):
    """Aggregated view of one investor. Public shares call this with include_history=False."""
    created = (
        Survey.objects.filter(creator=user, status__in=[SurveyStatus.PUBLISHED, SurveyStatus.CLOSED])
        .prefetch_related("questions__options")
        .order_by("-published_at")[:10]
    )
    since = timezone.now() - timedelta(days=183)
    timeline = (
        Response.objects.filter(user=user, submitted_at__gte=since)
        .annotate(month=TruncMonth("submitted_at"))
        .values("month")
        .annotate(n=Count("id"))
        .order_by("month")
    )

    data = {
        "owner_name": user.name,
        "surveys_created_count": Survey.objects.filter(creator=user).exclude(status=SurveyStatus.DRAFT).count(),
        "surveys_participated_count": Response.objects.filter(user=user).count(),
        "participation_timeline": [{"month": r["month"].date().isoformat(), "count": r["n"]} for r in timeline],
        "created_surveys": [build_results(s) for s in created],  # ~3 queries per survey; fine for <= 10
    }
    if include_history:
        recent = Response.objects.filter(user=user).select_related("survey").order_by("-submitted_at")[:20]
        data["history"] = [
            {"survey_id": str(r.survey_id), "title": r.survey.title, "submitted_at": r.submitted_at} for r in recent
        ]
    return data
