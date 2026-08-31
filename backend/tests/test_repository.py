
import os
os.environ.setdefault("REPAIRPILOT_ENV","development")
from app.repository import adapt_sql,backend_name

def test_sqlite_keeps_qmark():
    # Default test environment does not set DATABASE_URL.
    if backend_name()=="sqlite":
        assert adapt_sql("SELECT * FROM x WHERE a=? AND b=?")=="SELECT * FROM x WHERE a=? AND b=?"

def test_postgres_only_translates_placeholders(monkeypatch):
    monkeypatch.setenv("DATABASE_URL","postgresql://example.invalid/db")
    assert adapt_sql("SELECT * FROM invite_codes WHERE code=?") == "SELECT * FROM invite_codes WHERE code=%s"
    assert "repairpilot.repairpilot" not in adapt_sql("SELECT * FROM repairpilot.invite_codes WHERE code=?")
