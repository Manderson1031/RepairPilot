# RepairPilot V13 — Postgres Deployment

V13 fixes the major V12 gap: application CRUD now routes through a database adapter that supports SQLite locally and psycopg/Postgres in hosted environments.

## Local production-like validation

With Docker installed:

```bash
docker compose up --build
```

The stack starts:
- PostgreSQL 16
- RepairPilot API on port 8000

Then verify:

```bash
curl http://127.0.0.1:8000/ready
```

## CI validation

The GitHub Actions workflow now has a real PostgreSQL service container. It runs the same create-user → verify-login → create-equipment → save-repair smoke flow against Postgres.

This means a future code change cannot pass CI merely because SQLite works.

## Admin bootstrap

After a user account is registered:

```bash
cd backend
python -m app.make_admin owner@example.com
```

The command works against whichever database `DATABASE_URL` selects.

## Production

Set `DATABASE_URL` to the managed Postgres connection string. If it begins with `postgres://`, RepairPilot normalizes it for psycopg automatically.
