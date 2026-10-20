import secrets
from datetime import timedelta

from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core.permissions import IsVerifiedOrAdmin
from stats.services import build_dashboard

from .models import DashboardShare
from .serializers import CreateShareSerializer, ShareSerializer


class MyShareListCreateView(generics.ListAPIView):
    permission_classes = [IsVerifiedOrAdmin]
    serializer_class = ShareSerializer

    def get_queryset(self):
        return DashboardShare.objects.filter(user=self.request.user)

    @extend_schema(request=CreateShareSerializer, responses={201: ShareSerializer})
    def post(self, request):
        s = CreateShareSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        days = s.validated_data.get("expires_in_days")
        share = DashboardShare.objects.create(
            user=request.user,
            token=secrets.token_urlsafe(32),  # never derived from user IDs
            expires_at=timezone.now() + timedelta(days=days) if days else None,
        )
        return Response(ShareSerializer(share).data, status=201)


class MyShareRevokeView(APIView):
    permission_classes = [IsVerifiedOrAdmin]

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        share = get_object_or_404(DashboardShare, pk=pk, user=request.user)  # owner only
        if share.revoked_at is None:
            share.revoked_at = timezone.now()
            share.save(update_fields=["revoked_at"])
        return Response(status=204)


class PublicDashboardView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_dashboard"

    def get(self, request, token):
        share = DashboardShare.objects.select_related("user").filter(token=token).first()
        if share is None or not share.is_active:
            raise Http404  # same response for missing, revoked and expired
        data = build_dashboard(share.user, include_history=False)
        data["generated_at"] = timezone.now()
        return Response(data)
