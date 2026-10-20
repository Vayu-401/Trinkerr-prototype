from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError

from core.exceptions import Conflict
from stats.tasks import aggregate_survey
from surveys.models import QuestionType, SurveyStatus

from .models import Response, ResponseAnswer


def submit_response(*, survey, user, answers):
    if survey.status != SurveyStatus.PUBLISHED:
        raise ValidationError("This survey is not open for responses")

    questions = {q.id: q for q in survey.questions.prefetch_related("options")}
    seen, rows = set(), []
    for a in answers:
        qid = a["question_id"]
        question = questions.get(qid)
        if question is None:
            raise ValidationError(f"Question {qid} does not belong to this survey")
        if qid in seen:
            raise ValidationError(f"Duplicate answer for question {qid}")
        seen.add(qid)

        chosen = a["option_ids"]
        if len(set(chosen)) != len(chosen):
            raise ValidationError("Duplicate options in an answer")
        if not set(chosen) <= {o.id for o in question.options.all()}:
            raise ValidationError(f"Invalid option for question {qid}")
        if question.type == QuestionType.SINGLE and len(chosen) != 1:
            raise ValidationError(f"Question {qid} accepts exactly one option")
        rows += [(qid, oid) for oid in chosen]

    if seen != set(questions):
        raise ValidationError("All questions must be answered")

    try:
        with transaction.atomic():
            response = Response.objects.create(survey=survey, user=user)
            ResponseAnswer.objects.bulk_create(
                [ResponseAnswer(response=response, question_id=q, option_id=o) for q, o in rows]
            )
            # Enqueue only after the rows are committed, so the worker can see them.
            transaction.on_commit(lambda: aggregate_survey.delay(str(survey.id)))
    except IntegrityError:
        # The (survey, user) unique constraint is the real guard against double voting.
        raise Conflict("You have already responded to this survey")
    return response
