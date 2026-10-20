import pytest

from accounts.models import Role, User

from .conftest import PASSWORD, client_for

pytestmark = pytest.mark.django_db


def test_register_creates_investor_and_sets_cookie(api):
    r = api.post("/api/auth/register", {"email": "New@Example.com", "name": "New", "password": PASSWORD})
    assert r.status_code == 201
    assert r.data["user"]["role"] == "investor"
    assert r.data["user"]["verification_status"] == "unverified"
    assert r.data["user"]["email"] == "new@example.com"
    assert "access" in r.data
    cookie = r.cookies["refresh_token"]
    assert cookie["httponly"] and cookie["path"] == "/api/auth/"


def test_register_rejects_duplicate_email(api, investor):
    r = api.post("/api/auth/register", {"email": investor.email.upper(), "name": "X", "password": PASSWORD})
    assert r.status_code == 400


def test_login_failure_message_identical(api, investor):
    wrong_pw = api.post("/api/auth/login", {"email": investor.email, "password": "nope-nope-1"})
    unknown = api.post("/api/auth/login", {"email": "ghost@example.com", "password": "nope-nope-1"})
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.data == unknown.data == {"detail": "Invalid credentials"}


def test_login_then_me(api, investor):
    r = api.post("/api/auth/login", {"email": investor.email, "password": PASSWORD})
    assert r.status_code == 200
    api.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    me = api.get("/api/users/me")
    assert me.status_code == 200 and me.data["email"] == investor.email


def test_refresh_rotates_and_old_token_rejected(api, investor):
    api.post("/api/auth/login", {"email": investor.email, "password": PASSWORD})
    old = api.cookies["refresh_token"].value
    r = api.post("/api/auth/refresh")
    assert r.status_code == 200 and "access" in r.data
    new = api.cookies["refresh_token"].value
    assert new != old
    api.cookies["refresh_token"] = old
    assert api.post("/api/auth/refresh").status_code == 401


def test_refresh_without_cookie(api):
    assert api.post("/api/auth/refresh").status_code == 401


def test_logout_blacklists(api, investor):
    api.post("/api/auth/login", {"email": investor.email, "password": PASSWORD})
    token = api.cookies["refresh_token"].value
    assert api.post("/api/auth/logout").status_code == 204
    api.cookies["refresh_token"] = token
    assert api.post("/api/auth/refresh").status_code == 401


def test_me_requires_auth(api):
    assert api.get("/api/users/me").status_code == 401


def test_delete_me_requires_correct_password(investor):
    c = client_for(investor)
    assert c.delete("/api/users/me", {"password": "wrong"}, format="json").status_code == 400
    assert c.delete("/api/users/me", {"password": PASSWORD}, format="json").status_code == 204
    assert not User.objects.filter(id=investor.id).exists()


def test_admin_cannot_delete_self(admin_user):
    c = client_for(admin_user)
    assert c.delete("/api/users/me", {"password": PASSWORD}, format="json").status_code == 403
    assert User.objects.filter(id=admin_user.id, role=Role.ADMIN).exists()
