from rest_framework import generics

from core.permissions import IsVerifiedOrAdmin

from .models import Response
from .serializers import MyResponseSerializer


class MyResponsesView(generics.ListAPIView):
    """Poll history for the caller, newest first (served by user_history_idx)."""

    permission_classes = [IsVerifiedOrAdmin]
    serializer_class = MyResponseSerializer

    def get_queryset(self):
        return Response.objects.filter(user=self.request.user).select_related("survey").order_by("-submitted_at")
