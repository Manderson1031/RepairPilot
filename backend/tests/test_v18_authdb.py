import os
os.environ.setdefault("REPAIRPILOT_ENV","development")
os.environ.setdefault("REPAIRPILOT_SECRET","v18-test-secret")

from app import repository
from app import authdb


def fresh_db(tmp_path):
    repository.SQLITE_DB=tmp_path/"repairpilot-v18.db"
    authdb.init()


def test_password_reset_round_trip_and_hash_storage(tmp_path):
    fresh_db(tmp_path)
    user=authdb.create_user("reset@example.com","old-password")
    token=authdb.create_password_reset(user["email"])
    assert token
    with repository.connect() as c:
        row=c.execute("SELECT token FROM password_reset_tokens WHERE user_id=?",(user["id"],)).fetchone()
    assert row["token"] != token
    assert row["token"].startswith("sha256$")
    assert authdb.consume_password_reset(token,"new-password") is True
    assert authdb.verify(user["email"],"new-password") is not None
    assert authdb.consume_password_reset(token,"another-password") is False


def test_registration_is_atomic_and_duplicate_does_not_burn_invite(tmp_path):
    fresh_db(tmp_path)
    admin=authdb.create_user("owner@example.com","owner-password","admin")
    invite=authdb.create_invite(admin["id"],2)
    first,reason=authdb.register_user_with_invite("one@example.com","password123",invite["code"])
    assert reason=="ok" and first
    duplicate,reason=authdb.register_user_with_invite("one@example.com","password123",invite["code"])
    assert duplicate is None and reason=="exists"
    with repository.connect() as c:
        row=c.execute("SELECT uses,active FROM invite_codes WHERE code=?",(invite["code"],)).fetchone()
    assert row["uses"]==1 and row["active"]==1
    second,reason=authdb.register_user_with_invite("two@example.com","password123",invite["code"])
    assert reason=="ok" and second
    with repository.connect() as c:
        row=c.execute("SELECT uses,active FROM invite_codes WHERE code=?",(invite["code"],)).fetchone()
    assert row["uses"]==2 and row["active"]==0


def test_client_session_id_cannot_overwrite_another_user(tmp_path):
    fresh_db(tmp_path)
    u1=authdb.create_user("a@example.com","password123")
    u2=authdb.create_user("b@example.com","password123")
    sid=authdb.save_diagnostic_session(u1["id"],None,"first",{}, {"status":"ask","risk":{"level":"green"}}, "shared-id")
    assert sid=="shared-id"
    sid2=authdb.save_diagnostic_session(u2["id"],None,"second",{}, {"status":"ask","risk":{"level":"green"}}, "shared-id")
    assert sid2!="shared-id"
    with repository.connect() as c:
        rows=c.execute("SELECT id,user_id,symptom FROM diagnostic_sessions ORDER BY created").fetchall()
    assert len(rows)==2
    assert {r["user_id"] for r in rows}=={u1["id"],u2["id"]}


def test_current_model_router_defaults():
    from app.engine import select_model
    from app.models import DiagnoseRequest,EquipmentProfile,HistoryItem
    req=DiagnoseRequest(equipment_profile=EquipmentProfile(name="Mower",category="Small engine"),symptom="surges")
    assert select_model(req,[])=="gpt-5.6-luna"
    req.history=[HistoryItem(question="q",answer="a"),HistoryItem(question="q2",answer="a2")]
    assert select_model(req,[])=="gpt-5.6-terra"
    req.equipment_profile.category="Electrical control"
    assert select_model(req,[])=="gpt-5.6-sol"


def test_database_equipment_profile_normalizes_nullable_text_fields():
    from app.models import equipment_profile_from_record
    profile=equipment_profile_from_record({
        "id":"eq-1",
        "name":"Mower",
        "manufacturer":None,
        "model":None,
        "serial":None,
        "category":None,
        "notes":None,
    })
    assert profile.id=="eq-1"
    assert profile.name=="Mower"
    assert profile.manufacturer==""
    assert profile.model==""
    assert profile.serial==""
    assert profile.category==""
    assert profile.notes==""
