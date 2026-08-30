# RepairPilot V15 — Owner Handoff Candidate

V15 is the final useful local-only build before external account configuration.

## Added in V15
- owner setup CLI with cryptographically random production secret generation
- non-overwriting production environment generator
- demo account/equipment/repair seeder
- release preflight scanner
- committed-secret pattern checks
- stronger `.gitignore` for production secrets/backups
- production environment template
- exact owner-action boundary document
- single `START_HERE.md`

## Validation state
V14's 8/8 executable local tests carry forward. V15 adds packaging and preflight tooling rather than changing the diagnostic/safety engine.

## Next
Read `OWNER_ACTION_REQUIRED.md`.

The first remaining action requires a real managed database/private-storage project owned by the product owner. At that point I can continue with actual hosted configuration only after that service is created or connected.
