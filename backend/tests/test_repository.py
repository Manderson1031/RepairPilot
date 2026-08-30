
import os
os.environ.setdefault("REPAIRPILOT_ENV","development")
from app.repository import adapt_sql,backend_name

def test_sqlite_keeps_qmark():
    # Default test environment does not set DATABASE_URL.
    if backend_name()=="sqlite":
        assert adapt_sql("SELECT * FROM x WHERE a=? AND b=?")=="SELECT * FROM x WHERE a=? AND b=?"
