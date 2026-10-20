from rest_framework.permissions import BasePermission

from accounts.models import Role, VerificationStatus


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role == Role.ADMIN)


class IsVerifiedOrAdmin(BasePermission):
    message = "Your investor account must be verified to use this feature."

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.can_use_surveys)


class IsUnverifiedInvestor(BasePermission):
    """Investors who still need to (re)submit verification documents."""

    message = "Only investors who are not yet verified can upload documents."

    def has_permission(self, request, view):
        u = request.user
        return bool(
            u
            and u.is_authenticated
            and u.role == Role.INVESTOR
            and u.verification_status != VerificationStatus.VERIFIED
        )


class IsOwnerOrAdmin(BasePermission):
    """Set `owner_field` on the view ("creator_id" for surveys, "author_id" for posts)."""

    def has_object_permission(self, request, view, obj):
        owner_id = getattr(obj, getattr(view, "owner_field", "creator_id"))
        return request.user.role == Role.ADMIN or owner_id == request.user.id
