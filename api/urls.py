from django.urls import path
from . import views
app_name = "api"
urlpatterns = [
    path("pncp/processos/<int:pk>.json", views.pncp_processo, name="pncp_processo"),
]
