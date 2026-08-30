# RepairPilot V14 Operations

## Diagnostic session records
Every diagnosis now has a server-side session ID. Repeated steps update that session instead of existing only on the phone.

A repair outcome marks the session as:
- `fixed`
- `needs_work`

Admin metrics now distinguish unresolved sessions from confirmed fixes, which gives the beta a much better signal than simply counting API calls.

## Password recovery
The mobile app handles the configured `repairpilot://reset-password?token=...` deep link. Expo's custom scheme is already configured in `app.json`.

## Data export
Account JSON export is now written into the app cache and passed to the native share sheet instead of only being held in React state.

## Backup
`ops/backup.sh`:
- uses `pg_dump` when DATABASE_URL is Postgres
- copies the SQLite database in local mode

`ops/restore_postgres.sh` restores a PostgreSQL custom-format dump.

## Release validation
`ops/validate_release.sh` compiles backend code, runs the safety/session tests, and validates production configuration.
