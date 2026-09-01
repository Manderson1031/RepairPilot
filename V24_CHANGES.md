# RepairPilot V24 — Beta UX & Diagnostic Flow

## Mobile
- Added an immediate visible diagnostic thinking state while RepairPilot prepares the next step.
- Keeps the current diagnostic context visible while processing and locks duplicate actions.
- Improved iOS keyboard behavior with KeyboardAvoidingView, automatic input scrolling, Done-to-dismiss, and text retention until submission.
- Added contextual photo actions when a diagnostic question asks for a label, identification plate, spark plug, serial, or photo.
- Replaced developer-facing evidence labels with user-facing labels such as Your result, Observation, Diagnostic context, and Manual reference.
- Added a diagnosis-paused experience with an explicit resume-at-equipment action.
- Changed the unresolved outcome action from “Repair complete” to “End diagnosis / save outcome.”
- Added brighter blue/teal industrial styling and a subtle mechanical gear backdrop to the diagnostic workspace.
- Mobile version 0.16.0, iOS build 16, Android versionCode 16, package version 0.9.0.

## Diagnostic engine
- Added explicit anti-repetition guidance: do not repeat completed tests unless verification is necessary.
- Instructs the model to prefer structured inspection choices and offer “Unable to inspect right now” when practical.
- Treats unavailable-access answers as skipped/unavailable rather than negative findings.
- After two consecutive unavailable physical checks, pauses the diagnosis instead of cycling through additional hands-on checks.
- Paused sessions retain the last unavailable question so the user can resume at that point when back at the equipment.

## Safety
- Existing red-risk hard-stop behavior is unchanged.
- Pause/resume does not convert skipped checks into completed findings.
