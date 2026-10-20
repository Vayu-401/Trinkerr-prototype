import os
import re
import uuid

from botocore.exceptions import ClientError
from django.db import IntegrityError
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role, VerificationStatus
from core import storage
from core.permissions import IsUnverifiedInvestor

from .models import VerificationDocument
from .serializers import (
    ALLOWED_CONTENT_TYPES,
    MAX_BYTES,
    MAX_DOCUMENTS,
    DocumentSerializer,
    RegisterDocumentSerializer,
    UploadUrlSerializer,
)


def safe_filename(name: str) -> str:
    base = os.path.basename(name.replace("\\", "/"))
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", base).strip("._") or "file"
    return cleaned[:100]


def _check_document_limit(user):
    if user.verification_documents.count() >= MAX_DOCUMENTS:
        raise ValidationError(f"You can upload at most {MAX_DOCUMENTS} documents.")


class UploadUrlView(APIView):
    permission_classes = [IsUnverifiedInvestor]

    @extend_schema(request=UploadUrlSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        s = UploadUrlSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        _check_document_limit(request.user)
        key = f"verification/{request.user.id}/{uuid.uuid4()}-{safe_filename(s.validated_data['filename'])}"
        upload = storage.presigned_upload(key, s.validated_data["content_type"], MAX_BYTES)
        return Response({"upload": upload, "storage_key": key})


class RegisterDocumentView(APIView):
    permission_classes = [IsUnverifiedInvestor]

    @extend_schema(request=RegisterDocumentSerializer, responses=DocumentSerializer)
    def post(self, request):
        s = RegisterDocumentSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = request.user
        key = s.validated_data["storage_key"]
        if not key.startswith(f"verification/{user.id}/") or ".." in key:
            raise ValidationError({"storage_key": "Invalid storage key"})
        _check_document_limit(user)
        try:
            meta = storage.head(key)
        except ClientError:
            raise ValidationError({"storage_key": "File not found"})

        # Trust the storage metadata, not the client.
        content_type = meta.get("ContentType", "")
        size = int(meta.get("ContentLength", 0))
        if content_type not in ALLOWED_CONTENT_TYPES or not (0 < size <= MAX_BYTES):
            raise ValidationError({"storage_key": "Uploaded file has an unsupported type or size"})

        try:
            doc = VerificationDocument.objects.create(
                user=user,
                doc_type=s.validated_data["doc_type"],
                storage_key=key,
                original_filename=s.validated_data["original_filename"][:255],
                content_type=content_type,
                size_bytes=size,
            )
        except IntegrityError:
            raise ValidationError({"storage_key": "This file is already registered"})

        if user.verification_status in (VerificationStatus.UNVERIFIED, VerificationStatus.REJECTED):
            user.verification_status = VerificationStatus.PENDING
            user.save(update_fields=["verification_status"])
        return Response(DocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


class MyVerificationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        u = request.user
        docs = u.verification_documents.all() if u.role == Role.INVESTOR else []
        return Response(
            {
                "status": u.verification_status,
                "note": u.verification_note,
                "documents": DocumentSerializer(docs, many=True).data,
            }
        )
