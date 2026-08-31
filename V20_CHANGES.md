# RepairPilot V20 — Beta Lifecycle Hardening

## Hardened repair/session ownership
- `/repairs` now validates a supplied diagnostic `session_id` belongs to the authenticated user before saving the repair.
- Prevents a repair from being associated with another user's diagnostic-session identifier.
- Matches the ownership enforcement already used by `/feedback`.

## Automated beta lifecycle coverage
- Added an API regression test for the complete persisted lifecycle: equipment -> diagnose -> diagnostic session -> confirmed repair -> feedback -> session outcome verification.
- Added a cross-user diagnostic-session repair rejection test.
- The lifecycle test also exercises the V19 nullable equipment-field normalization path.

## Production status carried forward
- V19 `/diagnose` hotfix was verified live with repeated HTTP 200 responses and a stable session ID.
