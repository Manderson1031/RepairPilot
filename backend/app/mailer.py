
import os, json, urllib.request
from .config import settings

def send_password_reset(email:str,token:str)->dict:
    """Provider-neutral reset sender.

    If RESEND_API_KEY is configured, sends through Resend's HTTPS API.
    Otherwise development mode returns a non-delivery result.
    """
    base=settings.public_app_url.rstrip("/")
    link=f"{base}/reset-password?token={token}" if base else f"repairpilot://reset-password?token={token}"
    key=os.getenv("RESEND_API_KEY","")
    if not key:
        return {"sent":False,"provider":"none","development_link":link if settings.env!="production" else None}
    payload=json.dumps({
        "from":settings.reset_email_from or "RepairPilot <onboarding@resend.dev>",
        "to":[email],
        "subject":"Reset your RepairPilot password",
        "html":f"<p>A password reset was requested for your RepairPilot account.</p><p><a href='{link}'>Reset password</a></p><p>This link expires in 30 minutes.</p>"
    }).encode()
    req=urllib.request.Request("https://api.resend.com/emails",data=payload,method="POST",headers={
        "Authorization":f"Bearer {key}","Content-Type":"application/json"
    })
    with urllib.request.urlopen(req,timeout=15) as r:
        return {"sent":200 <= r.status < 300,"provider":"resend"}
