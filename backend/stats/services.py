from submissions.models import Response

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
