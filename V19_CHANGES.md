# RepairPilot V19 — Production Diagnose Hotfix

## Fixed
- Normalizes nullable equipment database text fields before constructing `EquipmentProfile`.
- Prevents `/diagnose` from returning HTTP 500 when an equipment row has `NULL` for `serial`, `manufacturer`, `model`, `category`, or `notes`.
- Added a regression test covering nullable equipment fields.
- Backend health/API version bumped to 0.9.1 for deployment verification.

## Production incident
V18 production returned a Pydantic `ValidationError` at `main.py:247` because the stored Husqvarna equipment profile had `serial = NULL` while the API model expects a string.
