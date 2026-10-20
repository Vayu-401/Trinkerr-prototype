import threading

import pytest
from django.db import connection, transaction

from stats import tasks
from stats.models import OptionStats, SurveyStats
from stats.services import percentage
from submissions.models import Response
from submissions.services import submit_response
from surveys.models import Option, Survey

from .conftest import client_for
from .factories import VerifiedInvestorFactory
from .helpers import create_survey


def answers_for(data, picks):
    """picks: list of option-index lists, one per question."""
    return [
        {"question_id": q["id"], "option_ids": [q["options"][i]["id"] for i in idx]}
        for q, idx in zip(data["questions"], picks, strict=True)
    ]


# ---------------- submitting (test 4) ----------------


@pytest.mark.django_db
def test_submit_happy_path_multi_select_then_conflict(verified, other_verified, django_capture_on_commit_callbacks):
    data = create_survey(client_for(verified))
    c = client_for(other_verified)
    url = f"/api/surveys/{data['id']}/responses"
    with django_capture_on_commit_callbacks(execute=True) as callbacks:
        r = c.post(url, {"answers": answers_for(data, [[0, 2], [1]])}, format="json")
    assert r.status_code == 201 and set(r.data) == {"id", "submitted_at"}
    assert len(callbacks) == 1  # one aggregation job enqueued after commit
    resp = Response.objects.get()
    assert resp.processed_at is not None  # eager worker already ran
    assert resp.answers.count() == 3
    assert c.post(url, {"answers": answers_for(data, [[1], [0]])}, format="json").status_code == 409
    assert Response.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    "mutate",
    [
        "foreign_option",  # option from another question
        "missing_question",
        "single_with_two",
        "duplicate_question",
        "duplicate_option",
        "unknown_question",
    ],
)
def test_submit_validation(verified, other_verified, mutate):
    data = create_survey(client_for(verified))
    q0, q1 = data["questions"]
    good = answers_for(data, [[0], [0]])
    bad = {
        "foreign_option": [{"question_id": q0["id"], "option_ids": [q1["options"][0]["id"]]}, good[1]],
        "missing_question": [good[0]],
        "single_with_two": [good[0], {"question_id": q1["id"], "option_ids": [o["id"] for o in q1["options"][:2]]}],
        "duplicate_question": [good[0], good[0], good[1]],
        "duplicate_option": [{"question_id": q0["id"], "option_ids": [q0["options"][0]["id"]] * 2}, good[1]],
        "unknown_question": [
            good[0],
            good[1],
            {"question_id": "00000000-0000-0000-0000-000000000000", "option_ids": [q0["options"][0]["id"]]},
        ],
    }[mutate]
    r = client_for(other_verified).post(f"/api/surveys/{data['id']}/responses", {"answers": bad}, format="json")
    assert r.status_code == 400, r.data
    assert Response.objects.count() == 0


@pytest.mark.django_db
def test_cannot_answer_draft_or_closed(verified, other_verified):
    owner = client_for(verified)
    draft = create_survey(owner, publish=False)
    closed = create_survey(owner)
    owner.patch(f"/api/surveys/{closed['id']}/close")
    c = client_for(other_verified)
    assert (
        c.post(
            f"/api/surveys/{draft['id']}/responses", {"answers": answers_for(draft, [[0], [0]])}, format="json"
        ).status_code
        == 404
    )
    assert (
        c.post(
            f"/api/surveys/{closed['id']}/responses", {"answers": answers_for(closed, [[0], [0]])}, format="json"
        ).status_code
        == 400
    )


@pytest.mark.django_db
def test_unverified_cannot_submit(verified, investor):
    data = create_survey(client_for(verified))
    r = client_for(investor).post(
        f"/api/surveys/{data['id']}/responses", {"answers": answers_for(data, [[0], [0]])}, format="json"
    )
    assert r.status_code == 403


# ---------------- aggregation (tests 5 & 6) ----------------


def make_responses(survey, picks_list):
    """Create responses directly (without aggregation) for a list of picks."""
    data_q = list(survey.questions.prefetch_related("options"))
    for picks in picks_list:
        user = VerifiedInvestorFactory()
        answers = [
            {"question_id": q.id, "option_ids": [list(q.options.all())[i].id for i in idx]}
            for q, idx in zip(data_q, picks, strict=True)
        ]
        submit_response(survey=survey, user=user, answers=answers)


@pytest.fixture
def survey_obj(verified):
    data = create_survey(client_for(verified))
    return Survey.objects.get(id=data["id"])


def option_counts(survey):
    return {
        (o.question.position, o.position): getattr(getattr(o, "stats", None), "selection_count", 0)
        for o in Option.objects.filter(question__survey=survey).select_related("question", "stats")
    }


@pytest.mark.django_db(transaction=True)
def test_aggregation_correct_and_idempotent(survey_obj):
    # submit_response inside a transaction=True test commits, so on_commit fires the (eager) task;
    # disable it here so we control exactly when aggregation runs.
    from unittest import mock

    with mock.patch.object(tasks.aggregate_survey, "delay"):
        make_responses(survey_obj, [[[0, 1], [0]], [[0], [2]], [[1, 2, 3], [0]]])
    assert Response.objects.filter(processed_at__isnull=True).count() == 3

    tasks.aggregate_survey(str(survey_obj.id))
    first = option_counts(survey_obj)
    assert SurveyStats.objects.get(survey=survey_obj).participant_count == 3
    assert first[(1, 1)] == 2 and first[(1, 2)] == 2 and first[(1, 3)] == 1 and first[(1, 4)] == 1
    assert first[(2, 1)] == 2 and first[(2, 3)] == 1

    tasks.aggregate_survey(str(survey_obj.id))  # second run changes nothing
    assert option_counts(survey_obj) == first
    assert SurveyStats.objects.get(survey=survey_obj).participant_count == 3

    with mock.patch.object(tasks.aggregate_survey, "delay"):
        make_responses(survey_obj, [[[3], [1]]])
    tasks.aggregate_survey(str(survey_obj.id))  # later response picked up
    after = option_counts(survey_obj)
    assert SurveyStats.objects.get(survey=survey_obj).participant_count == 4
    assert after[(1, 4)] == 2 and after[(2, 2)] == 1


@pytest.mark.django_db(transaction=True)
def test_locked_batch_is_skipped_by_second_worker(survey_obj):
    from unittest import mock

    with mock.patch.object(tasks.aggregate_survey, "delay"):
        make_responses(survey_obj, [[[0], [0]], [[1], [1]]])

    result = {}

    def other_worker():
        try:
            result["n"] = tasks._aggregate_batch(survey_obj.id)
        finally:
            connection.close()

    with transaction.atomic():  # worker A holds the row locks
        locked = list(Response.objects.select_for_update().filter(survey=survey_obj).values_list("id", flat=True))
        assert len(locked) == 2
        t = threading.Thread(target=other_worker)
        t.start()
        t.join(timeout=10)
    assert result["n"] == 0  # SKIP LOCKED: worker B didn't touch A's rows
    assert not SurveyStats.objects.filter(survey=survey_obj).exists()


@pytest.mark.django_db(transaction=True)
def test_concurrent_workers_never_double_count(survey_obj, monkeypatch):
    from unittest import mock

    with mock.patch.object(tasks.aggregate_survey, "delay"):
        make_responses(survey_obj, [[[i % 4], [i % 3]] for i in range(30)])
    monkeypatch.setattr(tasks, "BATCH", 4)

    def worker():
        try:
            tasks.aggregate_survey(str(survey_obj.id))
        finally:
            connection.close()

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)
    tasks.aggregate_survey(str(survey_obj.id))  # mop up anything skipped while locked
    assert SurveyStats.objects.get(survey=survey_obj).participant_count == 30
    counts = option_counts(survey_obj)
    assert sum(v for (qp, _), v in counts.items() if qp == 1) == 30
    assert sum(v for (qp, _), v in counts.items() if qp == 2) == 30
    assert Response.objects.filter(processed_at__isnull=True).count() == 0


@pytest.mark.django_db(transaction=True)
def test_sweeper_requeues_old_unprocessed(survey_obj):
    from datetime import timedelta
    from unittest import mock

    from django.utils import timezone

    with mock.patch.object(tasks.aggregate_survey, "delay"):
        make_responses(survey_obj, [[[0], [0]]])
    Response.objects.update(submitted_at=timezone.now() - timedelta(minutes=5))
    assert tasks.sweep_unprocessed() == 1  # eager: re-enqueued job runs immediately
    assert SurveyStats.objects.get(survey=survey_obj).participant_count == 1


# ---------------- results (test 7) ----------------


def test_percentage_math():
    assert percentage(650, 1620) == 40.1
    assert percentage(0, 0) == 0.0
    assert percentage(3, 3) == 100.0


@pytest.mark.django_db
def test_results_access_and_numbers(verified, other_verified, admin_user, django_capture_on_commit_callbacks):
    data = create_survey(client_for(verified))
    url = f"/api/surveys/{data['id']}/results"
    outsider = VerifiedInvestorFactory()

    # zero participants
    r = client_for(verified).get(url)
    assert r.status_code == 200 and r.data["participant_count"] == 0
    assert all(o["percentage"] == 0.0 for q in r.data["questions"] for o in q["options"])

    with django_capture_on_commit_callbacks(execute=True):
        client_for(other_verified).post(
            f"/api/surveys/{data['id']}/responses", {"answers": answers_for(data, [[0, 1], [2]])}, format="json"
        )
    assert client_for(outsider).get(url).status_code == 403  # hasn't answered
    for c in (client_for(other_verified), client_for(verified), client_for(admin_user)):
        assert c.get(url).status_code == 200
    r = client_for(other_verified).get(url).data
    assert r["participant_count"] == 1 and r["pending_responses"] == 0 and r["stats_updated_at"]
    q0 = r["questions"][0]["options"]
    assert [o["selection_count"] for o in q0] == [1, 1, 0, 0]
    assert [o["percentage"] for o in q0] == [100.0, 100.0, 0.0, 0.0]


@pytest.mark.django_db
def test_my_responses_history(verified, other_verified):
    a = create_survey(client_for(verified), title="Survey A")
    b = create_survey(client_for(verified), title="Survey B")
    c = client_for(other_verified)
    c.post(f"/api/surveys/{a['id']}/responses", {"answers": answers_for(a, [[0], [0]])}, format="json")
    c.post(f"/api/surveys/{b['id']}/responses", {"answers": answers_for(b, [[1], [1]])}, format="json")
    r = c.get("/api/me/responses")
    assert [x["survey"]["title"] for x in r.data["results"]] == ["Survey B", "Survey A"]
    assert set(r.data["results"][0]) == {"id", "survey", "submitted_at", "processed"}
    listing = c.get("/api/surveys").data["results"]
    assert all(s["has_responded"] for s in listing)


@pytest.mark.django_db
def test_survey_delete_cascades_responses(verified, other_verified, django_capture_on_commit_callbacks):
    data = create_survey(client_for(verified))
    with django_capture_on_commit_callbacks(execute=True):
        client_for(other_verified).post(
            f"/api/surveys/{data['id']}/responses", {"answers": answers_for(data, [[0], [0]])}, format="json"
        )
    assert client_for(verified).delete(f"/api/surveys/{data['id']}").status_code == 204
    assert Response.objects.count() == 0 and OptionStats.objects.count() == 0
