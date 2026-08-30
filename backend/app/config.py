
from pydantic import BaseModel
import os

class Settings(BaseModel):
    env: str = os.getenv("REPAIRPILOT_ENV","development")
    secret: str = os.getenv("REPAIRPILOT_SECRET","dev-only-change-me")
    allowed_origins: list[str] = [x.strip() for x in os.getenv("REPAIRPILOT_ALLOWED_ORIGINS","http://localhost:8081,http://127.0.0.1:8081").split(",") if x.strip()]
    max_image_mb: int = int(os.getenv("REPAIRPILOT_MAX_IMAGE_MB","12"))
    max_pdf_mb: int = int(os.getenv("REPAIRPILOT_MAX_PDF_MB","30"))
    rate_limit: str = os.getenv("REPAIRPILOT_RATE_LIMIT","60/minute")
    storage_backend: str = os.getenv("REPAIRPILOT_STORAGE_BACKEND","local")
    database_url: str = os.getenv("DATABASE_URL","")
    sentry_dsn: str = os.getenv("SENTRY_DSN","")
    public_app_url: str = os.getenv("REPAIRPILOT_PUBLIC_APP_URL","")
    reset_email_from: str = os.getenv("REPAIRPILOT_RESET_EMAIL_FROM","")
    supabase_url: str = os.getenv("SUPABASE_URL","")
    supabase_service_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY","")
    supabase_bucket: str = os.getenv("SUPABASE_STORAGE_BUCKET","repairpilot-private")

settings=Settings()

if settings.env=="production" and settings.secret=="dev-only-change-me":
    raise RuntimeError("REPAIRPILOT_SECRET must be set in production.")
