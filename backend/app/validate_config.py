
import os,sys
from .config import settings
from .repository import backend_name

def main():
    issues=[]
    warnings=[]
    if settings.env=="production":
        if settings.secret=="dev-only-change-me" or len(settings.secret)<32: issues.append("REPAIRPILOT_SECRET must be a strong production secret.")
        if not os.getenv("OPENAI_API_KEY"): issues.append("OPENAI_API_KEY is missing.")
        if not settings.database_url: issues.append("DATABASE_URL is missing.")
        if settings.storage_backend=="supabase":
            if not settings.supabase_url: issues.append("SUPABASE_URL is missing.")
            if not settings.supabase_service_key: issues.append("SUPABASE_SERVICE_ROLE_KEY is missing.")
        if not settings.allowed_origins: issues.append("No allowed CORS origins configured.")
        if not os.getenv("RESEND_API_KEY"): warnings.append("Password reset email provider is not configured.")
        if not settings.sentry_dsn: warnings.append("Sentry/error reporting is not configured.")
    print("RepairPilot configuration")
    print(" environment:",settings.env)
    print(" database:",backend_name())
    print(" storage:",settings.storage_backend)
    for w in warnings: print(" WARNING:",w)
    for i in issues: print(" ERROR:",i)
    raise SystemExit(1 if issues else 0)

if __name__=="__main__":main()
