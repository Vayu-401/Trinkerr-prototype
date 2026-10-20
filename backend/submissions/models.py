import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Response(models.Model):
    """One investor's submission to one survey. High-volume data lives here, not in the survey."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    survey = models.ForeignKey("surveys.Survey", on_delete=models.CASCADE, related_name="responses")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="responses")
    submitted_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)  # NULL = not yet aggregated

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["survey", "user"], name="one_response_per_user_per_survey")
        ]
        indexes = [
            models.Index(fields=["survey"], condition=Q(processed_at__isnull=True), name="unprocessed_resp_idx"),
            models.Index(fields=["user", "-submitted_at"], name="user_history_idx"),
        ]


class ResponseAnswer(models.Model):
    response = models.ForeignKey(Response, on_delete=models.CASCADE, related_name="answers")
    # CASCADE (not PROTECT): deleting a whole survey must remove its answers too. Published
    # surveys are immutable, so options are never deleted on their own while answers exist.
    question = models.ForeignKey("surveys.Question", on_delete=models.CASCADE)
    option = models.ForeignKey("surveys.Option", on_delete=models.CASCADE)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["response", "option"], name="uniq_answer_option")]
        indexes = [models.Index(fields=["option"])]
