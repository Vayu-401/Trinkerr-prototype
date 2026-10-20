import boto3
from botocore.client import Config
from django.conf import settings


def _client(endpoint):
    return boto3.client(
        "s3",
        endpoint_url=endpoint or None,
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def _internal():  # server-to-storage calls (inside the Docker network)
    return _client(settings.S3_INTERNAL_ENDPOINT)


def _public():  # used ONLY to sign URLs the browser will call (host must be browser-reachable)
    return _client(settings.S3_PUBLIC_ENDPOINT)


def presigned_upload(key, content_type, max_bytes):
    return _public().generate_presigned_post(
        settings.S3_BUCKET,
        key,
        Fields={"Content-Type": content_type},
        Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, max_bytes]],
        ExpiresIn=300,
    )


def presigned_download(key):
    return _public().generate_presigned_url(
        "get_object", Params={"Bucket": settings.S3_BUCKET, "Key": key}, ExpiresIn=120
    )


def head(key):
    return _internal().head_object(Bucket=settings.S3_BUCKET, Key=key)


def delete_objects(keys):
    """Best-effort removal of stored files (used when an account is deleted)."""
    keys = list(keys)
    if not keys:
        return
    try:
        _internal().delete_objects(
            Bucket=settings.S3_BUCKET, Delete={"Objects": [{"Key": k} for k in keys], "Quiet": True}
        )
    except Exception:  # storage outages must not block account deletion
        pass
