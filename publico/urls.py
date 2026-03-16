from django.urls import path
from . import views

app_name = "publico"

urlpatterns = [
    path("", views.lista_licitacoes, name="lista"),
    path("licitacao/<int:pk>/", views.detalhe_licitacao, name="detalhe"),
]
