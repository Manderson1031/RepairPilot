
import os, tempfile, uuid
os.environ["REPAIRPILOT_ENV"]="development"
os.environ["REPAIRPILOT_SECRET"]="test-secret-32-bytes-minimum-value"

from fastapi.testclient import TestClient
from app.main import app
from app.repository import connect as conn
from app.authdb import create_invite,create_user,token_for

client=TestClient(app)

def admin_token():
    with conn() as c:
        row=c.execute("SELECT * FROM users WHERE email='admin@test.local'").fetchone()
    if not row:
        u=create_user("admin@test.local","password123","admin")
        return token_for(u)
    return token_for(dict(row))

def test_health():
    r=client.get("/health")
    assert r.status_code==200
    assert r.json()["ok"] is True

def test_ready_checks_database():
    r=client.get("/ready")
    assert r.status_code==200
    assert r.json()["ok"] is True
    assert r.json()["database_reachable"] is True

def test_invite_and_register():
    token=admin_token()
    r=client.post("/admin/invites",headers={"Authorization":"Bearer "+token},json={"max_uses":1})
    assert r.status_code==200
    code=r.json()["code"]
    email="tester_"+code.lower().replace("-","")+"@example.com"
    r=client.post("/auth/register",json={"email":email,"password":"password123","invite_code":code})
    assert r.status_code==200
    assert "token" in r.json()

def test_bearer_auth_me():
    token=admin_token()
    r=client.get("/auth/me",headers={"Authorization":"Bearer "+token})
    assert r.status_code==200
    assert r.json()["email"]=="admin@test.local"


def test_deleted_account_token_is_immediately_invalid():
    email=f"delete-token-{uuid.uuid4().hex}@test.local"
    u=create_user(email,"password123","tester")
    token=token_for(u)
    r=client.delete("/account",headers={"Authorization":"Bearer "+token})
    assert r.status_code==200
    r=client.get("/auth/me",headers={"Authorization":"Bearer "+token})
    assert r.status_code==401

def test_database_role_overrides_stale_token_claim():
    email=f"role-change-{uuid.uuid4().hex}@test.local"
    u=create_user(email,"password123","tester")
    token=token_for(u)
    with conn() as c:
        c.execute("UPDATE users SET role='admin' WHERE id=?",(u["id"],))
    r=client.get("/admin/invites",headers={"Authorization":"Bearer "+token})
    assert r.status_code==200


def test_password_reset_invalidates_existing_token():
    from app.authdb import create_password_reset,consume_password_reset
    email=f"reset-token-{uuid.uuid4().hex}@test.local"
    u=create_user(email,"password123","tester")
    token=token_for(u)
    reset=create_password_reset(email)
    assert reset and consume_password_reset(reset,"newpassword123")
    r=client.get("/auth/me",headers={"Authorization":"Bearer "+token})
    assert r.status_code==401


def test_feedback_rejects_foreign_session():
    email1=f"feedback-a-{uuid.uuid4().hex}@test.local"
    email2=f"feedback-b-{uuid.uuid4().hex}@test.local"
    u1=create_user(email1,"password123","tester")
    u2=create_user(email2,"password123","tester")
    from app.authdb import save_diagnostic_session
    sid=save_diagnostic_session(u1["id"],None,"x",{}, {"status":"ask","risk":{"level":"green"}})
    r=client.post("/feedback",headers={"Authorization":"Bearer "+token_for(u2)},json={"session_id":sid,"rating":5,"success":True})
    assert r.status_code==404


def test_repair_rejects_invalid_outcome():
    email=f"repair-outcome-{uuid.uuid4().hex}@test.local"
    u=create_user(email,"password123","tester")
    token=token_for(u)
    r=client.post("/equipment",headers={"Authorization":"Bearer "+token},json={"name":"Test machine","category":"Small engine"})
    assert r.status_code==200
    eid=r.json()["id"]
    r=client.post("/repairs",headers={"Authorization":"Bearer "+token},json={"equipment_id":eid,"outcome":"maybe","fix":"x"})
    assert r.status_code==400
