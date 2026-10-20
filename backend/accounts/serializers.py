from django.contrib.auth import password_validation
from rest_framework import serializers

from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "name", "role", "verification_status", "verification_note"]


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=120)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, v):
        v = v.lower()
        if User.objects.filter(email=v).exists():
            raise serializers.ValidationError("Email already registered")
        return v

    def validate_password(self, v):
        password_validation.validate_password(v)
        return v


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class DeleteMeSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)
