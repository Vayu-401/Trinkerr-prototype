from django.db.models import Count, Exists, OuterRef, Q
from django.http import Http404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response as DRFResponse

from accounts.models import Role
from core.exceptions import Conflict
from core.permissions import IsOwnerOrAdmin, IsVerifiedOrAdmin
from stats.services import build_results
from submissions.models import Response as SurveyResponse
from submissions.serializers import SubmitResponseSerializer
from submissions.services import submit_response

from .models import Survey, SurveyStatus
from .serializers import SurveyDetailSerializer, SurveyListSerializer, SurveyWriteSerializer

UUID_RE = r"[0-9a-fA-F-]{36}"


class SurveyViewSet(viewsets.GenericViewSet):
    permission_classes = [IsVerifiedOrAdmin]
    owner_field = "creator_id"
    lookup_value_regex = UUID_RE
    serializer_class = SurveyDetailSerializer

    # ---------- helpers ----------
    def annotated(self, qs=None):
        qs = Survey.objects.all() if qs is None else qs
        return qs.select_related("creator").annotate(
            question_count=Count("questions", distinct=True),
            has_responded=Exists(SurveyResponse.objects.filter(survey=OuterRef("pk"), user=self.request.user)),
        )

    def get_permissions(self):
        perms = super().get_permissions()
        if self.action in ("destroy", "close", "publish", "update"):
            perms.append(IsOwnerOrAdmin())
        return perms

    def _is_owner_or_admin(self, survey):
        u = self.request.user
        return u.role == Role.ADMIN or survey.creator_id == u.id

    def get_object(self, qs=None):
        """Fetch a survey; drafts of other people behave as if they don't exist."""
        qs = self.annotated(qs)
        try:
            survey = qs.get(pk=self.kwargs["pk"])
        except Survey.DoesNotExist:
            raise Http404
        if survey.status == SurveyStatus.DRAFT and not self._is_owner_or_admin(survey):
            raise Http404
        self.check_object_permissions(self.request, survey)
        return survey

    def _detail(self, survey, http_status=200):
        survey = self.annotated(Survey.objects.prefetch_related("questions__options")).get(pk=survey.pk)
        return DRFResponse(SurveyDetailSerializer(survey).data, status=http_status)

    # ---------- endpoints ----------
    @extend_schema(responses=SurveyListSerializer(many=True))
    def list(self, request):
        qs = self.annotated(Survey.objects.filter(status=SurveyStatus.PUBLISHED)).order_by("-published_at")
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(SurveyListSerializer(page, many=True).data)

    @extend_schema(responses=SurveyListSerializer(many=True))
    @action(detail=False, methods=["get"])
    def mine(self, request):
        qs = self.annotated(Survey.objects.filter(creator=request.user)).order_by("-created_at")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(SurveyListSerializer(page, many=True).data)

    def retrieve(self, request, pk=None):
        survey = self.get_object(Survey.objects.prefetch_related("questions__options"))
        return DRFResponse(SurveyDetailSerializer(survey).data)

    @extend_schema(request=SurveyWriteSerializer, responses={201: SurveyDetailSerializer})
    def create(self, request):
        s = SurveyWriteSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        survey = s.save()
        return self._detail(survey, status.HTTP_201_CREATED)

    @extend_schema(request=SurveyWriteSerializer)
    def update(self, request, pk=None):  # PUT: drafts only
        survey = self.get_object()
        if survey.status != SurveyStatus.DRAFT:
            raise ValidationError("Only draft surveys can be edited")
        s = SurveyWriteSerializer(survey, data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        s.save()
        return self._detail(survey)

    @extend_schema(request=None)
    @action(detail=True, methods=["patch"])
    def publish(self, request, pk=None):
        survey = self.get_object()
        if survey.status != SurveyStatus.DRAFT:
            raise Conflict("Only draft surveys can be published")
        survey.status, survey.published_at = SurveyStatus.PUBLISHED, timezone.now()
        survey.save(update_fields=["status", "published_at"])
        return self._detail(survey)

    @extend_schema(request=None)
    @action(detail=True, methods=["patch"])
    def close(self, request, pk=None):
        survey = self.get_object()
        if survey.status != SurveyStatus.PUBLISHED:
            raise Conflict("Only published surveys can be closed")
        survey.status = SurveyStatus.CLOSED
        survey.save(update_fields=["status"])
        return self._detail(survey)

    @extend_schema(responses={204: None})
    def destroy(self, request, pk=None):
        survey = self.get_object()  # runs object permissions
        survey.delete()
        return DRFResponse(status=204)

    @extend_schema(request=SubmitResponseSerializer, responses={201: None})
    @action(detail=True, methods=["post"], url_path="responses")
    def submit(self, request, pk=None):
        survey = self.get_object()
        s = SubmitResponseSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        response = submit_response(survey=survey, user=request.user, answers=s.validated_data["answers"])
        # No statistics here: they are eventually consistent and computed by the worker.
        return DRFResponse({"id": str(response.id), "submitted_at": response.submitted_at}, status=201)

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        survey = self.get_object(Survey.objects.prefetch_related("questions__options"))
        allowed = (
            self._is_owner_or_admin(survey) or SurveyResponse.objects.filter(survey=survey, user=request.user).exists()
        )
        if not allowed:
            raise PermissionDenied("Answer this survey first to see how other investors voted.")
        return DRFResponse(build_results(survey))
