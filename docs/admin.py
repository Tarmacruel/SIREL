from django.contrib import admin
from .models import ProcessoAnexo

@admin.register(ProcessoAnexo)
class ProcessoAnexoAdmin(admin.ModelAdmin):
    list_display = ("processo","tipo","descricao","uploaded_at")
    list_filter = ("tipo","uploaded_at")
    search_fields = ("processo__numero_edital","descricao")
