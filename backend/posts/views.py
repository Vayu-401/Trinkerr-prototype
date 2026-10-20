import uuid

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsOwnerOrAdmin, IsVerifiedOrAdmin

from .models import Post
from .serializers import PostCreateSerializer, PostSerializer


class PostListCreateView(generics.ListAPIView):
    permission_classes = [IsVerifiedOrAdmin]
    serializer_class = PostSerializer

    @extend_schema(parameters=[OpenApiParameter("author", str, description="Filter by author id")])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        qs = Post.objects.select_related("author", "survey", "dashboard_share").order_by("-created_at")
        author = self.request.query_params.get("author")
        if author:
            try:
                uuid.UUID(author)
            except ValueError:
                raise ValidationError({"author": "Must be a valid id"})
            qs = qs.filter(author_id=author)
        return qs

    @extend_schema(request=PostCreateSerializer, responses={201: PostSerializer})
    def post(self, request):
        s = PostCreateSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        post = Post.objects.create(
            author=request.user,
            body=s.validated_data["body"],
            survey_id=s.validated_data.get("survey_id"),
            dashboard_share_id=s.validated_data.get("dashboard_share_id"),
        )
        post = Post.objects.select_related("author", "survey", "dashboard_share").get(pk=post.pk)
        return Response(PostSerializer(post).data, status=201)


class PostDeleteView(APIView):
    permission_classes = [IsVerifiedOrAdmin, IsOwnerOrAdmin]
    owner_field = "author_id"

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        self.check_object_permissions(request, post)
        post.delete()
        return Response(status=204)
