from django.db import models


class SurveyStats(models.Model):
    """Written only by the Celery worker. Views read it, never write it."""

    survey = models.OneToOneField(
        "surveys.Survey", on_delete=models.CASCADE, primary_key=True, related_name="stats"
    )
    participant_count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "survey_stats"


class OptionStats(models.Model):
    option = models.OneToOneField("surveys.Option", on_delete=models.CASCADE, primary_key=True, related_name="stats")
    survey = models.ForeignKey("surveys.Survey", on_delete=models.CASCADE, related_name="option_stats")
    selection_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "option_stats"
        indexes = [models.Index(fields=["survey"])]
