import pytest

from accounts.models import User
from posts.models import Post
from sharing.models import DashboardShare
from submissions.models import Response
from surveys.models import Survey

from .conftest import PASSWORD, client_for
from .factories import AdminFactory
from .helpers import create_survey
from .test_responses_and_stats import answers_for

pytestmark = pytest.mark.django_db


def test_unverified_cannot_post_or_read_feed(investor):
    c = client_for(investor)
    assert c.post("/api/posts", {"body": "hi"}, format="json").status_code == 403
    assert c.get("/api/posts").status_code == 403


def test_create_post_with_survey_and_share(verified):
    c = client_for(verified)
    survey = create_survey(c)
    share = c.post("/api/me/dashboard/shares", {}, format="json").data
    r = c.post(
        "/api/posts",
        {"body": "Equity is winning this quarter", "survey_id": survey["id"], "dashboard_share_id": share["id"]},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["survey"] == {"id": survey["id"], "title": survey["title"]}
    assert r.data["dashboard_url"] == share["url"]
    assert r.data["author"]["id"] == str(verified.id)
    # revoking the share hides the link on the post
    c.delete(f"/api/me/dashboard/shares/{share['id']}")
    feed = c.get("/api/posts").data["results"]
    assert feed[0]["dashboard_url"] is None


def test_post_validation(verified, other_verified):
    c = client_for(verified)
    draft = create_survey(c, publish=False)
    others_share = client_for(other_verified).post("/api/me/dashboard/shares", {}, format="json").data
    assert c.post("/api/posts", {"body": ""}, format="json").status_code == 400
    assert c.post("/api/posts", {"body": "x" * 2001}, format="json").status_code == 400
    assert c.post("/api/posts", {"body": "a", "survey_id": draft["id"]}, format="json").status_code == 400
    assert c.post("/api/posts", {"body": "a", "dashboard_share_id": others_share["id"]}, format="json").status_code == 400


def test_feed_newest_first_and_author_filter(verified, other_verified):
    a, b = client_for(verified), client_for(other_verified)
    a.post("/api/posts", {"body": "first"}, format="json")
    b.post("/api/posts", {"body": "second"}, format="json")
    a.post("/api/posts", {"body": "third"}, format="json")
    assert [p["body"] for p in a.get("/api/posts").data["results"]] == ["third", "second", "first"]
    mine = a.get(f"/api/posts?author={verified.id}").data["results"]
    assert [p["body"] for p in mine] == ["third", "first"]
    assert a.get("/api/posts?author=nope").status_code == 400


def test_post_delete_permissions(verified, other_verified, admin_user):
    p1 = client_for(verified).post("/api/posts", {"body": "mine"}, format="json").data
    p2 = client_for(verified).post("/api/posts", {"body": "mine too"}, format="json").data
    assert client_for(other_verified).delete(f"/api/posts/{p1['id']}").status_code == 403
    assert client_for(verified).delete(f"/api/posts/{p1['id']}").status_code == 204
    assert client_for(admin_user).delete(f"/api/posts/{p2['id']}").status_code == 204
    assert Post.objects.count() == 0


def test_survey_delete_keeps_post_without_link(verified):
    c = client_for(verified)
    survey = create_survey(c)
    c.post("/api/posts", {"body": "about it", "survey_id": survey["id"]}, format="json")
    c.delete(f"/api/surveys/{survey['id']}")
    assert c.get("/api/posts").data["results"][0]["survey"] is None


def test_admin_can_do_everything_an_investor_can(admin_user):
    c = client_for(admin_user)
    survey = create_survey(c)
    r = c.post(f"/api/surveys/{survey['id']}/responses", {"answers": answers_for(survey, [[0], [0]])}, format="json")
    assert r.status_code == 201
    assert c.post("/api/posts", {"body": "admin note"}, format="json").status_code == 201
    assert c.get("/api/me/dashboard").status_code == 200


def test_deleting_investor_cascades_everything(verified, other_verified, admin_user, django_capture_on_commit_callbacks):
    c = client_for(verified)
    s = create_survey(c)
    other = create_survey(client_for(other_verified))
    with django_capture_on_commit_callbacks(execute=True):
        c.post(f"/api/surveys/{other['id']}/responses", {"answers": answers_for(other, [[0], [0]])}, format="json")
    c.post("/api/posts", {"body": "bye"}, format="json")
    c.post("/api/me/dashboard/shares", {}, format="json")
    assert c.delete("/api/users/me", {"password": PASSWORD}, format="json").status_code == 204
    assert not User.objects.filter(id=verified.id).exists()
    assert not Survey.objects.filter(id=s["id"]).exists()
    assert not Response.objects.filter(user_id=verified.id).exists()
    assert not Post.objects.exists() and not DashboardShare.objects.exists()
    # the other investor's survey survives
    assert Survey.objects.filter(id=other["id"]).exists()


def test_admin_cannot_remove_admin(admin_user):
    other = AdminFactory()
    assert client_for(admin_user).delete(f"/api/admin/investors/{other.id}").status_code == 403
