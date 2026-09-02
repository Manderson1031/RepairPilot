# RepairPilot V31 — Visual Screen Preview

V31 adds a safe Expo Go workflow for reviewing individual screens without
creating or installing a new native build after every visual change.

## Preview workflow
- `EXPO_PUBLIC_PREVIEW_MODE=true` bypasses authentication with local preview data.
- `EXPO_PUBLIC_PREVIEW_SCREEN` selects the first screen shown after startup.
- The amber monitor/eye control opens a direct screen selector from any main screen.
- Preview mode includes representative equipment, repair history and a diagnostic step.
- A persistent amber banner makes preview mode unmistakable.
- Draft storage and all account/backend writes are disabled while previewing.

## Available preview screens
- Home
- Equipment
- AI Diagnosis
- Diagnostics
- Hardware Scanner
- AR Assistant
- Maintenance
- Account & Privacy

## Version
- App version: 0.23.0
- iOS build: 23
- Android versionCode: 23
- Mobile package: 0.16.0
