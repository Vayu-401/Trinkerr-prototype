from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import Option, Question, QuestionType, Survey, SurveyStatus


class OptionIn(serializers.Serializer):
    text = serializers.CharField(max_length=200)  # DRF trims whitespace and rejects blank


class QuestionIn(serializers.Serializer):
    text = serializers.CharField(max_length=500)
    type = serializers.ChoiceField(choices=QuestionType.choices, default=QuestionType.MULTIPLE)
    options = OptionIn(many=True, min_length=2, max_length=10)

    def validate_options(self, opts):
        texts = [o["text"].strip().lower() for o in opts]
        if len(set(texts)) != len(texts):
            raise serializers.ValidationError("Option texts must be unique within a question")
        return opts


class SurveyWriteSerializer(serializers.Serializer):
    title = serializers.CharField(min_length=3, max_length=200)
    description = serializers.CharField(allow_blank=True, required=False, max_length=2000, default="")
    questions = QuestionIn(many=True, min_length=1, max_length=20)
    publish = serializers.BooleanField(default=False)

    @transaction.atomic
    def create(self, validated):
        user = self.context["request"].user
        publish = validated.pop("publish")
        questions = validated.pop("questions")
        survey = Survey.objects.create(
            creator=user,
            status=SurveyStatus.PUBLISHED if publish else SurveyStatus.DRAFT,
            published_at=timezone.now() if publish else None,
            **validated,
        )
        self._write_questions(survey, questions)
        return survey

    @transaction.atomic
    def update(self, survey, validated):  # drafts only; the view enforces this
        publish = validated.pop("publish", False)
        questions = validated.pop("questions")
        for attr, value in validated.items():
            setattr(survey, attr, value)
        if publish:
            survey.status, survey.published_at = SurveyStatus.PUBLISHED, timezone.now()
        survey.save()
        survey.questions.all().delete()  # cascades to options
        self._write_questions(survey, questions)
        return survey

    @staticmethod
    def _write_questions(survey, questions):
        for qi, q in enumerate(questions, start=1):
            question = Question.objects.create(survey=survey, text=q["text"], type=q["type"], position=qi)
            Option.objects.bulk_create(
                [Option(question=question, text=o["text"], position=oi) for oi, o in enumerate(q["options"], 1)]
            )


class CreatorSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()


class SurveyListSerializer(serializers.ModelSerializer):
    creator = CreatorSerializer(read_only=True)
    question_count = serializers.IntegerField(read_only=True)
    has_responded = serializers.BooleanField(read_only=True)

    class Meta:
        model = Survey
        fields = [
            "id",
            "title",
            "description",
            "creator",
            "status",
            "published_at",
            "created_at",
            "question_count",
            "has_responded",
        ]


class OptionOut(serializers.ModelSerializer):
    class Meta:
        model = Option
        fields = ["id", "text", "position"]


class QuestionOut(serializers.ModelSerializer):
    options = OptionOut(many=True, read_only=True)

    class Meta:
        model = Question
        fields = ["id", "text", "type", "position", "options"]


class SurveyDetailSerializer(SurveyListSerializer):
    questions = QuestionOut(many=True, read_only=True)

    class Meta(SurveyListSerializer.Meta):
        fields = SurveyListSerializer.Meta.fields + ["questions"]
