from rest_framework import serializers

from accounts.models import User

from .models import DocType, VerificationDocument

ALLOWED_CONTENT_TYPES = ("application/pdf", "image/jpeg", "image/png")
MAX_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_DOCUMENTS = 5


class UploadUrlSerializer(serializers.Serializer):
    doc_type = serializers.ChoiceField(choices=DocType.choices)
    filename = serializers.CharField(max_length=255)
    content_type = serializers.ChoiceField(choices=[(c, c) for c in ALLOWED_CONTENT_TYPES])
    size_bytes = serializers.IntegerField(min_value=1, max_value=MAX_BYTES)


class RegisterDocumentSerializer(serializers.Serializer):
    storage_key = serializers.CharField(max_length=300)
    doc_type = serializers.ChoiceField(choices=DocType.choices)
    original_filename = serializers.CharField(max_length=255)


class DocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = VerificationDocument
        fields = ["id", "doc_type", "original_filename", "content_type", "size_bytes", "uploaded_at"]


class AdminInvestorSerializer(serializers.ModelSerializer):
    document_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "name",
            "verification_status",
            "verification_note",
            "document_count",
            "created_at",
            "verified_at",
        ]


class DecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["approve", "reject"])
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000)

    def validate(self, data):
        if data["decision"] == "reject" and not data.get("note", "").strip():
            raise serializers.ValidationError({"note": "A note is required when rejecting."})
        return data
