import uuid
from datetime import timedelta

from celery import shared_task
from django.db import connection, transaction
from django.db.models import Count
from django.utils import timezone

from submissions.models import Response, ResponseAnswer

BATCH = 500

# Increments happen inside SQL (count + EXCLUDED.count), so two workers can never
# overwrite each other's numbers the way a Python read-modify-write could.
OPTION_UPSERT = """
INSERT INTO option_stats (option_id, survey_id, selection_count)
VALUES (%s, %s, %s)
ON CONFLICT (option_id)
DO UPDATE SET selection_count = option_stats.selection_count + EXCLUDED.selection_count
"""
SURVEY_UPSERT = """
INSERT INTO survey_stats (survey_id, participant_count, updated_at)
VALUES (%s, %s, now())
ON CONFLICT (survey_id)
DO UPDATE SET participant_count = survey_stats.participant_count + EXCLUDED.participant_count,
              updated_at = now()
"""


def _aggregate_batch(survey_id) -> int:
    """Count one batch of unprocessed responses and mark them processed, atomically."""
    with transaction.atomic():
        ids = list(
            Response.objects.select_for_update(skip_locked=True)
            .filter(survey_id=survey_id, processed_at__isnull=True)
            .order_by("submitted_at")
            .values_list("id", flat=True)[:BATCH]
        )
        if not ids:
            return 0
        counts = (
            ResponseAnswer.objects.filter(response_id__in=ids).values("option_id").annotate(n=Count("id")).order_by()
        )
        with connection.cursor() as cur:
            cur.executemany(OPTION_UPSERT, [(r["option_id"], survey_id, r["n"]) for r in counts])
            cur.execute(SURVEY_UPSERT, [survey_id, len(ids)])
        Response.objects.filter(id__in=ids).update(processed_at=timezone.now())
        return len(ids)


@shared_task(autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 5})
def aggregate_survey(survey_id: str):
    sid = uuid.UUID(str(survey_id))
    total = 0
    while True:
        n = _aggregate_batch(sid)
        total += n
        if n < BATCH:
            return total


@shared_task
def sweep_unprocessed():
    """Safety net: re-enqueue surveys that still have old unprocessed responses."""
    cutoff = timezone.now() - timedelta(minutes=2)
    survey_ids = (
        Response.objects.filter(processed_at__isnull=True, submitted_at__lt=cutoff)
        .values_list("survey_id", flat=True)
        .distinct()
        .order_by()
    )
    for sid in survey_ids:
        aggregate_survey.delay(str(sid))
    return len(survey_ids)
