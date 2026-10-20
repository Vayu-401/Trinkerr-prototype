from rest_framework import serializers

from sharing.models import DashboardShare
from surveys.models import Survey, SurveyStatus

from .models import Post


class PostCreateSerializer(serializers.Serializer):
    body = serializers.CharField(min_length=1, max_length=2000)
    survey_id = serializers.UUIDField(required=False, allow_null=True)
    dashboard_share_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, data):
        user = self.context["request"].user
        if (
            data.get("survey_id")
            and not Survey.objects.filter(
                id=data["survey_id"], status__in=[SurveyStatus.PUBLISHED, SurveyStatus.CLOSED]
            ).exists()
        ):
            raise serializers.ValidationError({"survey_id": "Survey not found"})
        if data.get("dashboard_share_id"):
            share = DashboardShare.objects.filter(id=data["dashboard_share_id"], user=user).first()
            if share is None or not share.is_active:
                raise serializers.ValidationError({"dashboard_share_id": "Share link not found or inactive"})
        return data


class PostSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    survey = serializers.SerializerMethodField()
    dashboard_url = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = ["id", "body", "created_at", "author", "survey", "dashboard_url"]

    def get_author(self, obj) -> dict:
        return {"id": str(obj.author_id), "name": obj.author.name}

    def get_survey(self, obj) -> dict | None:
        # A draft can't be attached, but hide it anyway if one ever becomes a draft again.
        if obj.survey is None or obj.survey.status == SurveyStatus.DRAFT:
            return None
        return {"id": str(obj.survey_id), "title": obj.survey.title}

    def get_dashboard_url(self, obj) -> str | None:
        share = obj.dashboard_share
        return share.url if share and share.is_active else None
