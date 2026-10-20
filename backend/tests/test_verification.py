import pytest
from botocore.exceptions import ClientError

from accounts.models import VerificationStatus
from core import storage
from verification.models import VerificationDocument

from .conftest import client_for
from .factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def fake_storage(monkeypatch):
    objects = {}

    def head(key):
        if key not in objects:
            raise ClientError({"Error": {"Code": "404"}}, "HeadObject")
        return objects[key]

    monkeypatch.setattr(storage, "head", head)
    monkeypatch.setattr(
        storage, "presigned_upload", lambda key, ct, mx: {"url": "http://s3/bucket", "fields": {"key": key}}
    )
    monkeypatch.setattr(storage, "presigned_download", lambda key: f"http://s3/signed/{key}")
    monkeypatch.setattr(storage, "delete_objects", lambda keys: None)
    return objects


def upload_doc(client, user, fake_storage, content_type="application/pdf", size=1000):
    r = client.post(
        "/api/verification/upload-url",
        {"doc_type": "pan", "filename": "../my pan.pdf", "content_type": content_type, "size_bytes": size},
        format="json",
    )
    assert r.status_code == 200, r.data
    key = r.data["storage_key"]
    assert key.startswith(f"verification/{user.id}/") and "/.." not in key and " " not in key
    fake_storage[key] = {"ContentType": content_type, "ContentLength": size}
    return client.post(
        "/api/verification/documents",
        {"storage_key": key, "doc_type": "pan", "original_filename": "my pan.pdf"},
        format="json",
    )


def test_upload_url_validates_type_and_size(investor, fake_storage):
    c = client_for(investor)
    bad_type = c.post(
        "/api/verification/upload-url",
        {"doc_type": "pan", "filename": "a.exe", "content_type": "application/x-msdownload", "size_bytes": 10},
        format="json",
    )
    too_big = c.post(
        "/api/verification/upload-url",
        {"doc_type": "pan", "filename": "a.pdf", "content_type": "application/pdf", "size_bytes": 6 * 1024 * 1024},
        format="json",
    )
    assert bad_type.status_code == 400 and too_big.status_code == 400


def test_register_document_sets_pending(investor, fake_storage):
    r = upload_doc(client_for(investor), investor, fake_storage)
    assert r.status_code == 201
    investor.refresh_from_db()
    assert investor.verification_status == VerificationStatus.PENDING
    me = client_for(investor).get("/api/verification/me")
    assert me.data["status"] == "pending" and len(me.data["documents"]) == 1
    assert "storage_key" not in me.data["documents"][0]


def test_register_rejects_other_users_prefix(investor, fake_storage):
    other = UserFactory()
    key = f"verification/{other.id}/x.pdf"
    fake_storage[key] = {"ContentType": "application/pdf", "ContentLength": 10}
    r = client_for(investor).post(
        "/api/verification/documents",
        {"storage_key": key, "doc_type": "pan", "original_filename": "x.pdf"},
        format="json",
    )
    assert r.status_code == 400


def test_register_missing_file(investor, fake_storage):
    r = client_for(investor).post(
        "/api/verification/documents",
        {"storage_key": f"verification/{investor.id}/nope.pdf", "doc_type": "pan", "original_filename": "x.pdf"},
        format="json",
    )
    assert r.status_code == 400 and "File not found" in str(r.data)


def test_size_and_type_come_from_storage(investor, fake_storage):
    c = client_for(investor)
    r = c.post(
        "/api/verification/upload-url",
        {"doc_type": "pan", "filename": "a.pdf", "content_type": "application/pdf", "size_bytes": 10},
        format="json",
    )
    key = r.data["storage_key"]
    fake_storage[key] = {"ContentType": "text/html", "ContentLength": 10}  # what was really stored
    r = c.post(
        "/api/verification/documents",
        {"storage_key": key, "doc_type": "pan", "original_filename": "a.pdf"},
        format="json",
    )
    assert r.status_code == 400


def test_verified_investor_cannot_upload(verified, fake_storage):
    r = client_for(verified).post(
        "/api/verification/upload-url",
        {"doc_type": "pan", "filename": "a.pdf", "content_type": "application/pdf", "size_bytes": 10},
        format="json",
    )
    assert r.status_code == 403


def test_admin_review_flow(investor, admin_user, fake_storage):
    admin = client_for(admin_user)
    url = f"/api/admin/investors/{investor.id}/verification"
    # not pending yet -> 409
    assert admin.patch(url, {"decision": "approve"}, format="json").status_code == 409

    upload_doc(client_for(investor), investor, fake_storage)
    listing = admin.get("/api/admin/investors?status=pending")
    assert [i["id"] for i in listing.data["results"]] == [str(investor.id)]
    assert listing.data["results"][0]["document_count"] == 1

    docs = admin.get(f"/api/admin/investors/{investor.id}/documents")
    assert docs.data["documents"][0]["download_url"].startswith("http://s3/signed/")

    # reject needs a note
    assert admin.patch(url, {"decision": "reject"}, format="json").status_code == 400
    r = admin.patch(url, {"decision": "reject", "note": "Blurry scan"}, format="json")
    assert r.status_code == 200 and r.data["verification_status"] == "rejected"

    # re-upload moves back to pending, then approve
    upload_doc(client_for(investor), investor, fake_storage)
    investor.refresh_from_db()
    assert investor.verification_status == "pending"
    r = admin.patch(url, {"decision": "approve"}, format="json")
    assert r.status_code == 200 and r.data["verification_status"] == "verified"
    investor.refresh_from_db()
    assert investor.verified_by_id == admin_user.id and investor.verified_at and investor.verification_note == ""


def test_approve_requires_document(investor, admin_user):
    investor.verification_status = VerificationStatus.PENDING
    investor.save()
    r = client_for(admin_user).patch(
        f"/api/admin/investors/{investor.id}/verification", {"decision": "approve"}, format="json"
    )
    assert r.status_code == 400


def test_admin_endpoints_forbidden_to_investors(verified, investor):
    c = client_for(verified)
    assert c.get("/api/admin/investors").status_code == 403
    assert c.delete(f"/api/admin/investors/{investor.id}").status_code == 403


def test_admin_remove_investor_but_not_admin(admin_user, investor, fake_storage):
    from .factories import AdminFactory

    c = client_for(admin_user)
    upload_doc(client_for(investor), investor, fake_storage)
    assert c.delete(f"/api/admin/investors/{investor.id}").status_code == 204
    assert not VerificationDocument.objects.filter(user_id=investor.id).exists()
    other_admin = AdminFactory()
    assert c.delete(f"/api/admin/investors/{other_admin.id}").status_code == 403
    assert c.delete(f"/api/admin/investors/{admin_user.id}").status_code == 403


def test_max_five_documents(investor, fake_storage):
    c = client_for(investor)
    for _ in range(5):
        assert upload_doc(c, investor, fake_storage).status_code == 201
    r = c.post(
        "/api/verification/upload-url",
        {"doc_type": "pan", "filename": "a.pdf", "content_type": "application/pdf", "size_bytes": 10},
        format="json",
    )
    assert r.status_code == 400
