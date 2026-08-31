# RepairPilot V17 changes

## Authentication / Swagger
- Replaced raw `Header` bearer-token parsing with FastAPI `HTTPBearer` credentials.
- Swagger/OpenAPI now exposes the standard bearer authorization scheme, avoiding the mobile Swagger issue where the visible `authorization` field was not sent.
- Existing mobile clients remain compatible because they already send the normal `Authorization: Bearer <token>` header.

## PostgreSQL
- Removed the brittle global `invite_codes` string rewrite from `repository.adapt_sql`.
- PostgreSQL connections already set `search_path` to `repairpilot, public`, so ordinary unqualified table names resolve correctly.
- `adapt_sql` now only translates SQLite-style `?` placeholders to psycopg `%s` placeholders.
- Added a regression test ensuring already-qualified table names cannot become `repairpilot.repairpilot.*`.

## Tests
- Fixed a stale test import (`conn` -> repository `connect`).
- Added an authenticated `/auth/me` regression test.
- Added PostgreSQL SQL-adaptation regression coverage.
- In the available execution environment, 9 dependency-independent tests pass. Full API tests require the project dependencies from `backend/requirements.txt`; package installation was blocked here by network/package-index access.
