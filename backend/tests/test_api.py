
import os, tempfile
os.environ["REPAIRPILOT_ENV"]="development"
os.environ["REPAIRPILOT_SECRET"]="test-secret"

from fastapi.testclient import TestClient
from app.main import app
from app.authdb import conn,create_invite,create_user,token_for

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

def test_invite_and_register():
    token=admin_token()
    r=client.post("/admin/invites",headers={"Authorization":"Bearer "+token},json={"max_uses":1})
    assert r.status_code==200
    code=r.json()["code"]
    email="tester_"+code.lower().replace("-","")+"@example.com"
    r=client.post("/auth/register",json={"email":email,"password":"password123","invite_code":code})
    assert r.status_code==200
    assert "token" in r.json()
