
from __future__ import annotations
import os, sqlite3
from pathlib import Path
from contextlib import AbstractContextManager
from .config import settings

SQLITE_DB=Path(__file__).resolve().parents[2]/"data"/"repairpilot.db"

def backend_name()->str:
    url=(settings.database_url or "").lower()
    return "postgres" if url.startswith(("postgres://","postgresql://")) else "sqlite"

def _pg_url()->str:
    url=settings.database_url
    if url.startswith("postgres://"):
        return "postgresql://"+url[len("postgres://"):]
    return url

def adapt_sql(sql:str)->str:
    """Translate the small qmark SQL subset used by RepairPilot to psycopg format."""
    return sql.replace("invite_codes","repairpilot.invite_codes").replace("?","%s") if backend_name()=="postgres" else sql

class Database(AbstractContextManager):
    def __init__(self):
        self.kind=backend_name()
        self.raw=None

    def __enter__(self):
        if self.kind=="postgres":
            import psycopg
            from psycopg.rows import dict_row
            self.raw=psycopg.connect(_pg_url(),row_factory=dict_row)
            self.raw.execute("SET search_path TO repairpilot, public")
        else:
            SQLITE_DB.parent.mkdir(parents=True,exist_ok=True)
            self.raw=sqlite3.connect(SQLITE_DB)
            self.raw.row_factory=sqlite3.Row
        return self

    def execute(self,sql,args=()):
        return self.raw.execute(adapt_sql(sql),args)

    def executescript(self,sql):
        if self.kind=="sqlite":
            return self.raw.executescript(sql)
        # schema scripts in this project contain ordinary semicolon-separated DDL.
        cur=None
        for stmt in (x.strip() for x in sql.split(";")):
            if stmt:
                cur=self.raw.execute(stmt)
        return cur

    def commit(self):
        self.raw.commit()

    def rollback(self):
        self.raw.rollback()

    def __exit__(self,exc_type,exc,tb):
        if self.raw is not None:
            if exc_type is None: self.raw.commit()
            else: self.raw.rollback()
            self.raw.close()
        return False

def connect():
    return Database()

def integrity_errors():
    errors=[sqlite3.IntegrityError]
    try:
        import psycopg
        errors.append(psycopg.IntegrityError)
    except Exception:
        pass
    return tuple(errors)
