from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsVerifiedOrAdmin

from .services import build_dashboard


class MyDashboardView(APIView):
    permission_classes = [IsVerifiedOrAdmin]

    def get(self, request):
        return Response(build_dashboard(request.user, include_history=True))
