# RepairPilot V21 — Diagnostic Session Integrity

## Canonical session IDs in persisted snapshots
- Diagnostic-session `request_json` and `response_json` now always contain the canonical persisted `session_id`.
- Fixes the live-beta observation where the API returned the correct session ID but the stored AI response snapshot still contained `session_id: null`.
- If a client supplies a session ID owned by another user, the server generates a new safe ID and stamps that new ID into both snapshots.

## Regression coverage
- Added a test proving both persisted JSON snapshots contain the same session ID as the database row.
- Existing V19 nullable-equipment and V20 lifecycle/ownership regressions remain in place.

## Version
- Backend API/health version: 0.9.3.
