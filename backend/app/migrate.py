
from pathlib import Path
import time
from .repository import connect,backend_name

BASE=Path(__file__).resolve().parents[1]
MIG=BASE/"migrations"

def run():
    # Postgres production schema is idempotent and complete; authdb.init applies it.
    # Migration records are still initialized so future numbered migrations can be added.
    if backend_name()=="postgres":
        with connect() as c:
            c.execute("CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,applied bigint)")
        return True

    with connect() as c:
        c.execute("CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied INTEGER)")
        done={r["name"] for r in c.execute("SELECT name FROM schema_migrations").fetchall()}
        for p in sorted(MIG.glob("*.sql")):
            if p.name in done: continue
            c.executescript(p.read_text(encoding="utf-8"))
            c.execute("INSERT INTO schema_migrations(name,applied) VALUES(?,?)",(p.name,int(time.time())))
    return True
