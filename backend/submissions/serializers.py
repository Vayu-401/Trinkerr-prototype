from rest_framework import serializers

from .models import Response


class AnswerIn(serializers.Serializer):
    question_id = serializers.UUIDField()
    option_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=10)


class SubmitResponseSerializer(serializers.Serializer):
    answers = AnswerIn(many=True, min_length=1, max_length=20)


class SurveyRef(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()


class MyResponseSerializer(serializers.ModelSerializer):
    survey = SurveyRef(read_only=True)
    processed = serializers.SerializerMethodField()

    class Meta:
        model = Response
        fields = ["id", "survey", "submitted_at", "processed"]

    def get_processed(self, obj) -> bool:
        return obj.processed_at is not None
