from rest_framework.routers import DefaultRouter

from .views import SurveyViewSet

router = DefaultRouter(trailing_slash=False)
router.include_root_view = False
router.register("surveys", SurveyViewSet, basename="survey")

urlpatterns = router.urls
