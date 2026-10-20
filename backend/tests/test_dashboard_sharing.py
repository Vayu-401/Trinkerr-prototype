from datetime import timedelta

import pytest
from django.utils import timezone

from sharing.models import DashboardShare

from .conftest import client_for
from .helpers import create_survey
from .test_responses_and_stats import answers_for

pytestmark = pytest.mark.django_db


@pytest.fixture
def owner_with_activity(verified, other_verified, django_capture_on_commit_callbacks):
    mine = create_survey(client_for(verified), title="Owner survey")
    create_survey(client_for(verified), publish=False, title="Owner secret draft")
    theirs = create_survey(client_for(other_verified), title="Someone else's survey")
    with django_capture_on_commit_callbacks(execute=True):
        client_for(other_verified).post(
            f"/api/surveys/{mine['id']}/responses", {"answers": answers_for(mine, [[0, 1], [0]])}, format="json"
        )
        client_for(verified).post(
            f"/api/surveys/{theirs['id']}/responses", {"answers": answers_for(theirs, [[2], [1]])}, format="json"
        )
    return verified


def test_private_dashboard(owner_with_activity):
    d = client_for(owner_with_activity).get("/api/me/dashboard").data
    assert d["surveys_created_count"] == 1 and d["surveys_participated_count"] == 1
    assert [s["title"] for s in d["created_surveys"]] == ["Owner survey"]
    assert d["created_surveys"][0]["participant_count"] == 1
    assert d["participation_timeline"][0]["count"] == 1
    assert [h["title"] for h in d["history"]] == ["Someone else's survey"]


def test_unverified_has_no_dashboard(investor):
    assert client_for(investor).get("/api/me/dashboard").status_code == 403
    assert client_for(investor).post("/api/me/dashboard/shares", {}, format="json").status_code == 403


def test_share_link_public_view_has_aggregates_only(owner_with_activity, api):
    r = client_for(owner_with_activity).post("/api/me/dashboard/shares", {"expires_in_days": 7}, format="json")
    assert r.status_code == 201
    assert r.data["url"].endswith(f"/shared/{r.data['token']}") and r.data["is_active"]
    assert len(r.data["token"]) >= 43  # 32 random bytes, base64url
    pub = api.get(f"/api/public/dashboards/{r.data['token']}")
    assert pub.status_code == 200
    body = str(pub.data)
    assert "history" not in pub.data
    assert owner_with_activity.email not in body
    assert "Someone else's survey" not in body  # surveys they answered stay private
    assert "Owner secret draft" not in body
    assert pub.data["owner_name"] == owner_with_activity.name and pub.data["generated_at"]


def test_revoked_and_expired_both_404(owner_with_activity, api):
    c = client_for(owner_with_activity)
    revoked = c.post("/api/me/dashboard/shares", {}, format="json").data
    assert c.delete(f"/api/me/dashboard/shares/{revoked['id']}").status_code == 204
    expired = c.post("/api/me/dashboard/shares", {"expires_in_days": 1}, format="json").data
    DashboardShare.objects.filter(id=expired["id"]).update(expires_at=timezone.now() - timedelta(seconds=1))
    a = api.get(f"/api/public/dashboards/{revoked['token']}")
    b = api.get(f"/api/public/dashboards/{expired['token']}")
    c404 = api.get("/api/public/dashboards/not-a-real-token")
    assert a.status_code == b.status_code == c404.status_code == 404
    assert a.data == b.data == c404.data
    shares = c.get("/api/me/dashboard/shares").data["results"]
    assert {s["is_active"] for s in shares} == {False}


def test_share_revoke_owner_only(owner_with_activity, other_verified):
    share = client_for(owner_with_activity).post("/api/me/dashboard/shares", {}, format="json").data
    assert client_for(other_verified).delete(f"/api/me/dashboard/shares/{share['id']}").status_code == 404
    assert DashboardShare.objects.get(id=share["id"]).revoked_at is None


def test_expiry_bounds(verified):
    c = client_for(verified)
    assert c.post("/api/me/dashboard/shares", {"expires_in_days": 0}, format="json").status_code == 400
    assert c.post("/api/me/dashboard/shares", {"expires_in_days": 366}, format="json").status_code == 400
    r = c.post("/api/me/dashboard/shares", {"expires_in_days": None}, format="json")
    assert r.status_code == 201 and r.data["expires_at"] is None


def test_public_dashboard_ignores_stale_bearer(owner_with_activity, api):
    token = client_for(owner_with_activity).post("/api/me/dashboard/shares", {}, format="json").data["token"]
    api.credentials(HTTP_AUTHORIZATION="Bearer garbage")
    assert api.get(f"/api/public/dashboards/{token}").status_code == 200
