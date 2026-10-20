import factory

from accounts.models import Role, User, VerificationStatus


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    name = factory.Faker("name")
    role = Role.INVESTOR
    verification_status = VerificationStatus.UNVERIFIED

    @factory.post_generation
    def password(obj, create, extracted, **kwargs):
        obj.set_password(extracted or "Str0ngPass!word")
        if create:
            obj.save()


class VerifiedInvestorFactory(UserFactory):
    verification_status = VerificationStatus.VERIFIED


class AdminFactory(UserFactory):
    role = Role.ADMIN
    verification_status = VerificationStatus.VERIFIED
    is_staff = True
