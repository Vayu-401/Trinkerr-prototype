from rest_framework import serializers

from .models import DashboardShare


class CreateShareSerializer(serializers.Serializer):
    expires_in_days = serializers.IntegerField(min_value=1, max_value=365, required=False, allow_null=True)


class ShareSerializer(serializers.ModelSerializer):
    url = serializers.CharField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = DashboardShare
        fields = ["id", "token", "url", "expires_at", "revoked_at", "created_at", "is_active"]
