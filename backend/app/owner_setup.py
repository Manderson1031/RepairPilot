
from pathlib import Path
import argparse,secrets,os
from .authdb import create_user,verify
from .repository import backend_name

TEMPLATE="""REPAIRPILOT_ENV=production
REPAIRPILOT_SECRET={secret}
REPAIRPILOT_ALLOWED_ORIGINS={origins}
REPAIRPILOT_RATE_LIMIT=60/minute
REPAIRPILOT_MAX_IMAGE_MB=12
REPAIRPILOT_MAX_PDF_MB=30
REPAIRPILOT_STORAGE_BACKEND=supabase
DATABASE_URL=PASTE_MANAGED_POSTGRES_URL_HERE
OPENAI_API_KEY=PASTE_OPENAI_API_KEY_HERE
SUPABASE_URL=PASTE_SUPABASE_PROJECT_URL_HERE
SUPABASE_SERVICE_ROLE_KEY=PASTE_SUPABASE_SERVICE_ROLE_KEY_HERE
SUPABASE_STORAGE_BUCKET=repairpilot-private
RESEND_API_KEY=PASTE_RESEND_API_KEY_HERE
REPAIRPILOT_RESET_EMAIL_FROM=RepairPilot <reset@YOUR_DOMAIN>
REPAIRPILOT_PUBLIC_APP_URL=https://YOUR_APP_OR_LANDING_PAGE
SENTRY_DSN=PASTE_SENTRY_DSN_HERE
"""

def main():
    p=argparse.ArgumentParser(description="Prepare RepairPilot owner deployment files.")
    p.add_argument("--write-env",action="store_true",help="Write backend/.env.production.generated with a fresh server secret.")
    p.add_argument("--origin",default="https://YOUR_FRONTEND_ORIGIN")
    args=p.parse_args()

    print("RepairPilot Owner Setup")
    print("database backend currently selected:",backend_name())
    if args.write_env:
        target=Path(__file__).resolve().parents[1]/".env.production.generated"
        if target.exists():
            raise SystemExit(f"{target} already exists; refusing to overwrite a secret-bearing file.")
        target.write_text(TEMPLATE.format(secret=secrets.token_urlsafe(48),origins=args.origin),encoding="utf-8")
        print("created:",target)
        print("Fill in the PASTE_* values, then run: python -m app.validate_config")
    else:
        print("Run with --write-env to generate a production env file containing a fresh RepairPilot server secret.")

if __name__=="__main__":main()
