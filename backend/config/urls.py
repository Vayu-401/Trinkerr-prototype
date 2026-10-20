from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from accounts.urls import auth_urlpatterns, users_urlpatterns
from sharing.views import MyShareListCreateView, MyShareRevokeView, PublicDashboardView
from stats.views import MyDashboardView
from submissions.views import MyResponsesView
from verification.urls import admin_urlpatterns, verification_urlpatterns

api_patterns = [
    path("auth/", include(auth_urlpatterns)),
    path("users/", include(users_urlpatterns)),
    path("verification/", include(verification_urlpatterns)),
    path("admin/", include(admin_urlpatterns)),
    path("", include("surveys.urls")),
    path("me/responses", MyResponsesView.as_view(), name="me-responses"),
    path("me/dashboard", MyDashboardView.as_view(), name="me-dashboard"),
    path("me/dashboard/shares", MyShareListCreateView.as_view(), name="me-shares"),
    path("me/dashboard/shares/<uuid:pk>", MyShareRevokeView.as_view(), name="me-share-revoke"),
    path("public/dashboards/<str:token>", PublicDashboardView.as_view(), name="public-dashboard"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/", include(api_patterns)),
]
