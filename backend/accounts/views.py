from django.conf import settings
from django.contrib.auth import authenticate
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Role, User
from .serializers import DeleteMeSerializer, LoginSerializer, RegisterSerializer, UserSerializer


def _set_refresh_cookie(resp, token):
    resp.set_cookie(
        settings.AUTH_COOKIE_NAME,
        str(token),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path=settings.AUTH_COOKIE_PATH,
    )


def _clear_refresh_cookie(resp):
    resp.delete_cookie(
        settings.AUTH_COOKIE_NAME,
        path=settings.AUTH_COOKIE_PATH,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )


def _session_response(user, http_status=200):
    refresh = RefreshToken.for_user(user)
    resp = Response(
        {"access": str(refresh.access_token), "user": UserSerializer(user).data},
        status=http_status,
    )
    _set_refresh_cookie(resp, refresh)
    return resp


class AuthBaseView(APIView):
    """Auth endpoints ignore any (possibly expired) Bearer header and are rate limited."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"


class RegisterView(AuthBaseView):
    @extend_schema(request=RegisterSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = User.objects.create_user(role=Role.INVESTOR, **s.validated_data)
        return _session_response(user, status.HTTP_201_CREATED)


class LoginView(AuthBaseView):
    @extend_schema(request=LoginSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        email = str(request.data.get("email", "")).lower()
        user = authenticate(request, email=email, password=request.data.get("password", ""))
        if user is None or not user.is_active:
            # Same message for unknown email and wrong password.
            return Response({"detail": "Invalid credentials"}, status=401)
        return _session_response(user)


class RefreshView(AuthBaseView):
    throttle_scope = "auth_refresh"

    @extend_schema(request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if not raw:
            return Response({"detail": "No refresh token"}, status=401)
        ser = TokenRefreshSerializer(data={"refresh": raw})
        try:
            ser.is_valid(raise_exception=True)
        except (TokenError, InvalidToken):
            resp = Response({"detail": "Invalid refresh token"}, status=401)
            _clear_refresh_cookie(resp)
            return resp
        resp = Response({"access": ser.validated_data["access"]})
        _set_refresh_cookie(resp, ser.validated_data["refresh"])  # rotated token
        return resp


class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass
        resp = Response(status=204)
        _clear_refresh_cookie(resp)
        return resp


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @extend_schema(request=DeleteMeSerializer, responses={204: None})
    def delete(self, request):
        if request.user.role == Role.ADMIN:
            return Response({"detail": "Admin accounts cannot be deleted here"}, status=403)
        if not request.user.check_password(request.data.get("password", "")):
            return Response({"detail": "Incorrect password"}, status=400)
        from core import storage

        keys = list(request.user.verification_documents.values_list("storage_key", flat=True))
        request.user.delete()  # cascades to surveys, responses, posts and shares
        storage.delete_objects(keys)
        resp = Response(status=204)
        _clear_refresh_cookie(resp)
        return resp
