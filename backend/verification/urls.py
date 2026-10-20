from django.urls import path

from .admin_views import (
    AdminInvestorDeleteView,
    AdminInvestorDocumentsView,
    AdminInvestorListView,
    AdminVerificationDecisionView,
)
from .views import MyVerificationView, RegisterDocumentView, UploadUrlView

verification_urlpatterns = [
    path("upload-url", UploadUrlView.as_view(), name="verification-upload-url"),
    path("documents", RegisterDocumentView.as_view(), name="verification-documents"),
    path("me", MyVerificationView.as_view(), name="verification-me"),
]

admin_urlpatterns = [
    path("investors", AdminInvestorListView.as_view(), name="admin-investors"),
    path("investors/<uuid:pk>", AdminInvestorDeleteView.as_view(), name="admin-investor-delete"),
    path("investors/<uuid:pk>/documents", AdminInvestorDocumentsView.as_view(), name="admin-investor-documents"),
    path(
        "investors/<uuid:pk>/verification",
        AdminVerificationDecisionView.as_view(),
        name="admin-investor-verification",
    ),
]
