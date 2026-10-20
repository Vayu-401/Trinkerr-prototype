import uuid

from django.conf import settings
from django.db import models


class SurveyStatus(models.TextChoices):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class QuestionType(models.TextChoices):
    SINGLE = "single"  # exactly one option
    MULTIPLE = "multiple"  # one or more options


class Survey(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    creator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="surveys")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=SurveyStatus.choices, default=SurveyStatus.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "-published_at"]),
            models.Index(fields=["creator", "-created_at"]),
        ]

    def __str__(self):
        return self.title


class Question(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    survey = models.ForeignKey(Survey, on_delete=models.CASCADE, related_name="questions")
    text = models.CharField(max_length=500)
    type = models.CharField(max_length=10, choices=QuestionType.choices, default=QuestionType.MULTIPLE)
    position = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["position"]
        constraints = [models.UniqueConstraint(fields=["survey", "position"], name="uniq_question_position")]


class Option(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="options")
    text = models.CharField(max_length=200)
    position = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["position"]
        constraints = [models.UniqueConstraint(fields=["question", "position"], name="uniq_option_position")]
