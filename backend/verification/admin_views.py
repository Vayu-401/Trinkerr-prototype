from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role, User, VerificationStatus
from core import storage
from core.exceptions import Conflict
from core.permissions import IsAdminRole

from .serializers import AdminInvestorSerializer, DecisionSerializer, DocumentSerializer


def investors_qs():
    return User.objects.filter(role=Role.INVESTOR).annotate(document_count=Count("verification_documents"))


class AdminInvestorListView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class = AdminInvestorSerializer

    @extend_schema(
        parameters=[
            OpenApiParameter("status", str, enum=[s.value for s in VerificationStatus]),
            OpenApiParameter("search", str),
        ]
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        qs = investors_qs().order_by("-created_at")
        st = self.request.query_params.get("status")
        if st:
            if st not in VerificationStatus.values:
                raise ValidationError({"status": "Unknown status"})
            qs = qs.filter(verification_status=st)
        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(email__icontains=search))
        return qs


class AdminInvestorDocumentsView(APIView):
    permission_classes = [IsAdminRole]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request, pk):
        user = get_object_or_404(investors_qs(), pk=pk)
        docs = []
        for d in user.verification_documents.all():
            item = DocumentSerializer(d).data
            item["download_url"] = storage.presigned_download(d.storage_key)
            docs.append(item)
        return Response({"investor": AdminInvestorSerializer(user).data, "documents": docs})


class AdminVerificationDecisionView(APIView):
    permission_classes = [IsAdminRole]

    @extend_schema(request=DecisionSerializer, responses=AdminInvestorSerializer)
    def patch(self, request, pk):
        user = get_object_or_404(User.objects.filter(role=Role.INVESTOR), pk=pk)
        s = DecisionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        if user.verification_status != VerificationStatus.PENDING:
            raise Conflict("Only pending investors can be reviewed")

        if s.validated_data["decision"] == "approve":
            if not user.verification_documents.exists():
                raise ValidationError("Cannot approve an investor without documents")
            user.verification_status = VerificationStatus.VERIFIED
            user.verified_by = request.user
            user.verified_at = timezone.now()
            user.verification_note = ""
        else:
            user.verification_status = VerificationStatus.REJECTED
            user.verification_note = s.validated_data["note"].strip()
        user.save(update_fields=["verification_status", "verified_by", "verified_at", "verification_note"])
        return Response(AdminInvestorSerializer(investors_qs().get(pk=user.pk)).data)


class AdminInvestorDeleteView(APIView):
    permission_classes = [IsAdminRole]

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if user.role == Role.ADMIN:
            raise PermissionDenied("Admin accounts cannot be removed")
        keys = list(user.verification_documents.values_list("storage_key", flat=True))
        user.delete()  # cascades to surveys, responses, posts and shares
        storage.delete_objects(keys)
        return Response(status=204)
