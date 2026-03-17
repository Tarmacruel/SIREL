# licitaweb/settings.py
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Básico / segurança ---
SECRET_KEY = 'django-insecure-)45ef0pinv(k0%r^yd-k49p(sazx_r8ia_%h@zpnc+j!1z)903'
DEBUG = True

ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]
CSRF_TRUSTED_ORIGINS = [
    "http://127.0.0.1",
    "http://localhost",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]

# --- Identidade do município (1x só) ---
MUNICIPIO_NOME = "Teixeira de Freitas"
MUNICIPIO_UF = "BA"

# --- Apps ---
INSTALLED_APPS = [
    # seus apps
    "api",
    "publico",
    "docs",
    "ofertas",
    "core",
    "workflow",

    # django
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # terceiros
    "rest_framework",
    "simple_history",
    "import_export",
]

# --- Middlewares ---
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # WhiteNoise logo após SecurityMiddleware
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "core.middleware.MojibakeRepairMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "simple_history.middleware.HistoryRequestMiddleware",
]

ROOT_URLCONF = "licitaweb.urls"

# --- Templates (inclui debug/static/request para evitar 500 com DEBUG=False) ---
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "core" / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.template.context_processors.static",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "workflow.context_processors.orgao_ativo",
            ],
        },
    },
]

WSGI_APPLICATION = "licitaweb.wsgi.application"

# --- Banco (sqlite para testes locais) ---
DATABASES = {
    "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
}

# Aceita muitos campos vindos do admin (inlines grandes / importações)
DATA_UPLOAD_MAX_NUMBER_FIELDS = 200000

# --- i18n ---
LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Bahia"
USE_I18N = True
USE_TZ = True

# --- Arquivos estáticos / mídia ---
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"] if (BASE_DIR / "static").exists() else []

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# WhiteNoise (manifest comprimido) + tolerância a entradas faltantes em dev-prod local
STORAGES = {
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
}
WHITENOISE_MANIFEST_STRICT = False

# --- Outras configs ---
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LOGIN_URL = "/sirel/login/"
LOGIN_REDIRECT_URL = "/sirel/"
LOGOUT_REDIRECT_URL = "/sirel/login/"

# Caminho dos modelos DOCX
DOCS_TEMPLATES_DIR = BASE_DIR / "docs" / "templates" / "word"


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return bool(default)
    return str(value).strip().lower() in {"1", "true", "t", "yes", "y", "sim", "s", "on"}


# Integração PNCP (envio opcional, desabilitado por padrão)
PNCP_ENVIO_HABILITADO = _env_bool("PNCP_ENVIO_HABILITADO", False)
PNCP_ENVIO_DRY_RUN = _env_bool("PNCP_ENVIO_DRY_RUN", True)
PNCP_ENVIO_BASE_URL = os.getenv("PNCP_ENVIO_BASE_URL", "https://pncp.gov.br/api/pncp").strip()
PNCP_ENVIO_TIMEOUT = int(os.getenv("PNCP_ENVIO_TIMEOUT", "45"))
PNCP_ENVIO_AUTH_TOKEN = os.getenv("PNCP_ENVIO_AUTH_TOKEN", "").strip()
PNCP_DETALHAMENTO_AUTOSTART = _env_bool("PNCP_DETALHAMENTO_AUTOSTART", True)
PNCP_DETALHAMENTO_AUTOSTART_LIMIT = int(os.getenv("PNCP_DETALHAMENTO_AUTOSTART_LIMIT", "20"))

# Fonte padrao para importacao consolidada de processos (BLL + PNCP)
DADOS_LICITACAO_URL = os.getenv(
    "DADOS_LICITACAO_URL",
    "https://raw.githubusercontent.com/sergiocarneiro-adm/licitacao/main/dados.json",
).strip()
