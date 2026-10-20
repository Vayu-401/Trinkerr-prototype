import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .factories import AdminFactory, UserFactory, VerifiedInvestorFactory

PASSWORD = "Str0ngPass!word"


@pytest.fixture(autouse=True)
def _test_settings(settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # fast tests
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = True
    from config.celery import app

    app.conf.task_always_eager = True
    app.conf.task_eager_propagates = True
    cache.clear()  # reset throttling counters between tests
    yield


@pytest.fixture
def api():
    return APIClient()


def client_for(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return c


@pytest.fixture
def investor(db):
    return UserFactory()


@pytest.fixture
def verified(db):
    return VerifiedInvestorFactory()


@pytest.fixture
def other_verified(db):
    return VerifiedInvestorFactory()


@pytest.fixture
def admin_user(db):
    return AdminFactory()
