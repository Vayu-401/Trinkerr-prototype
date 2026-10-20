import pytest

from surveys.models import Option, Question, Survey

from .conftest import client_for
from .helpers import create_survey, survey_body

pytestmark = pytest.mark.django_db


def test_unverified_investor_forbidden(investor):
    c = client_for(investor)
    assert c.get("/api/surveys").status_code == 403
    assert c.post("/api/surveys", survey_body(), format="json").status_code == 403


def test_create_nested_with_positions(verified):
    data = create_survey(client_for(verified))
    assert data["status"] == "published" and data["published_at"]
    assert data["question_count"] == 2 and data["has_responded"] is False
    assert data["creator"]["id"] == str(verified.id)
    qs = data["questions"]
    assert [q["position"] for q in qs] == [1, 2]
    assert [o["text"] for o in qs[0]["options"]] == ["Equity", "Mutual Funds", "Gold", "Bonds"]
    assert [o["position"] for o in qs[0]["options"]] == [1, 2, 3, 4]
    assert qs[1]["type"] == "single"


@pytest.mark.parametrize(
    "questions",
    [
        [{"text": "Q", "options": [{"text": "Only one"}]}],  # < 2 options
        [{"text": "Q", "options": [{"text": str(i)} for i in range(11)]}],  # > 10 options
        [{"text": "Q", "options": [{"text": "Gold"}, {"text": " gold "}]}],  # duplicate, case-insensitive
        [{"text": "Q", "options": [{"text": "A"}, {"text": "   "}]}],  # blank option
        [{"text": f"Q{i}", "options": [{"text": "A"}, {"text": "B"}]} for i in range(21)],  # > 20 questions
    ],
)
def test_create_validation(verified, questions):
    r = client_for(verified).post("/api/surveys", survey_body(questions=questions), format="json")
    assert r.status_code == 400


def test_create_requires_questions_and_title(verified):
    c = client_for(verified)
    body = survey_body()
    body["questions"] = []
    assert c.post("/api/surveys", body, format="json").status_code == 400
    assert c.post("/api/surveys", survey_body(title="ab"), format="json").status_code == 400


def test_list_shows_published_only_newest_first(verified, other_verified):
    mine = client_for(verified)
    first = create_survey(mine, title="First survey")
    create_survey(mine, publish=False, title="Hidden draft")
    second = create_survey(mine, title="Second survey")
    listing = client_for(other_verified).get("/api/surveys")
    assert [s["id"] for s in listing.data["results"]] == [second["id"], first["id"]]
    assert listing.data["count"] == 2


def test_mine_includes_drafts(verified, other_verified):
    c = client_for(verified)
    create_survey(c, publish=False, title="Draft one")
    create_survey(c, title="Published one")
    create_survey(client_for(other_verified), title="Not mine")
    r = c.get("/api/surveys/mine")
    assert {s["title"] for s in r.data["results"]} == {"Draft one", "Published one"}


def test_draft_visibility(verified, other_verified, admin_user):
    draft = create_survey(client_for(verified), publish=False)
    url = f"/api/surveys/{draft['id']}"
    assert client_for(other_verified).get(url).status_code == 404
    assert client_for(verified).get(url).status_code == 200
    assert client_for(admin_user).get(url).status_code == 200


def test_update_draft_replaces_questions(verified):
    c = client_for(verified)
    draft = create_survey(c, publish=False)
    body = survey_body(
        publish=False,
        title="Edited title",
        questions=[{"text": "New Q", "type": "single", "options": [{"text": "Yes"}, {"text": "No"}]}],
    )
    r = c.put(f"/api/surveys/{draft['id']}", body, format="json")
    assert r.status_code == 200 and r.data["title"] == "Edited title"
    assert [q["text"] for q in r.data["questions"]] == ["New Q"]
    assert Question.objects.filter(survey_id=draft["id"]).count() == 1
    assert Option.objects.filter(question__survey_id=draft["id"]).count() == 2


def test_published_is_immutable(verified):
    c = client_for(verified)
    pub = create_survey(c)
    assert c.put(f"/api/surveys/{pub['id']}", survey_body(), format="json").status_code == 400


def test_publish_and_close_lifecycle(verified, other_verified):
    c = client_for(verified)
    draft = create_survey(c, publish=False)
    sid = draft["id"]
    assert client_for(other_verified).patch(f"/api/surveys/{sid}/publish").status_code == 404  # hidden draft
    r = c.patch(f"/api/surveys/{sid}/publish")
    assert r.status_code == 200 and r.data["status"] == "published"
    assert c.patch(f"/api/surveys/{sid}/publish").status_code == 409
    assert client_for(other_verified).patch(f"/api/surveys/{sid}/close").status_code == 403
    r = c.patch(f"/api/surveys/{sid}/close")
    assert r.status_code == 200 and r.data["status"] == "closed"
    assert c.patch(f"/api/surveys/{sid}/close").status_code == 409
    # closed surveys drop out of the open list but stay viewable
    assert client_for(other_verified).get("/api/surveys").data["count"] == 0
    assert client_for(other_verified).get(f"/api/surveys/{sid}").status_code == 200


def test_delete_permissions(verified, other_verified, admin_user):
    a = create_survey(client_for(verified))
    b = create_survey(client_for(verified))
    assert client_for(other_verified).delete(f"/api/surveys/{a['id']}").status_code == 403
    assert client_for(verified).delete(f"/api/surveys/{a['id']}").status_code == 204
    assert client_for(admin_user).delete(f"/api/surveys/{b['id']}").status_code == 204
    assert Survey.objects.count() == 0
