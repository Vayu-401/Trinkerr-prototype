import uuid

from django.conf import settings
from django.db import models


class Post(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="posts")
    body = models.TextField()  # max 2000 chars enforced in the serializer
    survey = models.ForeignKey("surveys.Survey", null=True, blank=True, on_delete=models.SET_NULL)
    dashboard_share = models.ForeignKey("sharing.DashboardShare", null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["-created_at"])]
        ordering = ["-created_at"]
