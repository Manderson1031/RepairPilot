# RepairPilot V16

Deployment correction release.

- Uses the existing Supabase Postgres database rather than provisioning a second Render database.
- Postgres connections set `search_path` to the private `repairpilot` schema.
- Postgres schema bootstrap creates/uses `repairpilot` and revokes Data API roles.
- Removed local SQLite beta data and Python cache artifacts from the deployable package.
- Render Blueprint now prompts for `DATABASE_URL` instead of creating a Render Postgres database.
