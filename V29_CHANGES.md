# RepairPilot V29 — Concept-Match UI Rebuild

V29 is a visual-system rebuild aimed directly at the approved RepairPilot concept instead of adding more decoration to the prior layout.

## Visual changes
- Replaced the dominant full-screen gear wallpaper with a much quieter edge-weighted industrial steel background so content stays primary.
- Tightened the home dashboard into denser technician-style quick-action tiles with stronger icon hierarchy and reduced dead space.
- Added reusable section headers and compact top/bottom navigation treatments for a more consistent instrument-panel feel.
- Rebuilt Equipment rows as discrete compact machine cards with clearer name/model/category/serial hierarchy and a dedicated chevron.
- Rebuilt Account & Privacy using the same header, bottom navigation, action-row, safety-card and profile-card language as the concept.
- Reduced oversized borders, radii, padding and background clutter across key screens.
- Kept Hardware Scanner and AR Assistant prominent while leaving unfinished measurement/AR engines clearly non-fabricated.

## Functional integrity
- Existing authentication, equipment CRUD, photo/manual analysis, diagnosis, safety handling, repair history, account export/delete, scanner camera capture, and beta diagnostic state are preserved.
- No sample equipment or fake hardware identifications were added to live user data.

## Version
- App version: 0.21.0
- iOS build: 21
- Android versionCode: 21
- Mobile package: 0.14.0
