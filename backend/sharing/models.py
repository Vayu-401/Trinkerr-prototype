import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class DashboardShare(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="dashboard_shares")
    token = models.CharField(max_length=64, unique=True)  # secrets.token_urlsafe(32): 256 random bits
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_active(self):
        return self.revoked_at is None and (self.expires_at is None or self.expires_at > timezone.now())

    @property
    def url(self):
        return f"{settings.FRONTEND_URL}/shared/{self.token}"
