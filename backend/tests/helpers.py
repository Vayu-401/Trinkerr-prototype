def survey_body(publish=True, questions=None, title="Where will you invest next quarter?"):
    return {
        "title": title,
        "description": "Select all that apply",
        "publish": publish,
        "questions": questions
        or [
            {
                "text": "Preferred asset classes",
                "type": "multiple",
                "options": [{"text": "Equity"}, {"text": "Mutual Funds"}, {"text": "Gold"}, {"text": "Bonds"}],
            },
            {
                "text": "Expected market direction",
                "type": "single",
                "options": [{"text": "Up"}, {"text": "Flat"}, {"text": "Down"}],
            },
        ],
    }


def create_survey(client, **kw):
    r = client.post("/api/surveys", survey_body(**kw), format="json")
    assert r.status_code == 201, r.data
    return r.data
