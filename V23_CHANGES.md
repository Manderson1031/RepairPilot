# RepairPilot V23 — Mobile Beta Resilience

V23 focuses on making the first real iPhone beta session safer and less brittle before owner/device testing begins.

## Mobile changes
- Added authenticated request timeout handling (25 seconds) with a clear retry message instead of hanging indefinitely.
- Added global handling for HTTP 401 responses: expired/invalid sessions are cleared from SecureStore and the user is returned to login.
- Added operation locking/loading states to prevent duplicate diagnosis, equipment-create, photo, manual, and repair submissions.
- Added manufacturer, model, and serial fields when creating an equipment profile so diagnostic context is useful from the first session.
- Added existing-photo selection in addition to taking a new camera photo.
- Reused one photo-analysis upload path for camera and photo-library inputs.
- Added client-side password reset length validation.
- Added explicit STOP / ESCALATE UI for red-risk or escalated diagnostic responses and suppresses answer controls on red hard stops.
- Improved network/error handling for equipment, history, review queue, account export, report download, diagnosis, photo analysis, manual upload, and repair completion.
- Bumped mobile app version to 0.15.0, iOS build 15, Android versionCode 15, and package version 0.8.0.

## Validation
- Mobile TSX transpile/syntax check: PASS (`index.tsx`, `_layout.tsx`).
- Backend Python compileall: PASS.
- Dependency-independent backend tests: 16 passed.
- Full backend suite was not re-run in this container because `slowapi` is not installed here; the production requirements still include it and the prior V22 full suite result remains 27 passing.
- Preflight: 16 passed, 0 failures, 1 legal-review warning.

## Still requires external/device access
- Install dependencies in the connected GitHub Codespace and run `npm run check` / Expo Doctor.
- Launch Expo Go on a physical iPhone and complete the device smoke test.
- Later: EAS/Apple provisioning for a native internal build.
