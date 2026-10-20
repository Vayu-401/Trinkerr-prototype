from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsVerifiedOrAdmin

from .services import build_dashboard


class MyDashboardView(APIView):
    permission_classes = [IsVerifiedOrAdmin]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(build_dashboard(request.user, include_history=True))
