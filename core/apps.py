# -*- coding: utf-8 -*-
from django.apps import AppConfig

class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
    def ready(self):
        try:
            from . import admin_process_dashboards  # noqa: F401
        except Exception:
            pass
