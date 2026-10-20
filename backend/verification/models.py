import uuid

from django.conf import settings
from django.db import models


class DocType(models.TextChoices):
    PAN = "pan", "PAN card"
    AADHAAR = "aadhaar", "Aadhaar card"
    DEMAT_STATEMENT = "demat_statement", "Demat statement"
    BANK_STATEMENT = "bank_statement", "Bank statement"
    OTHER = "other", "Other"


class VerificationDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="verification_documents"
    )
    doc_type = models.CharField(max_length=50, choices=DocType.choices)
    storage_key = models.CharField(max_length=300, unique=True)  # object key in the bucket
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size_bytes = models.PositiveIntegerField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]
