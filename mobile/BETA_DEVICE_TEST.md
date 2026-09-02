# RepairPilot mobile beta device test

## What is already prepared
- Production API URL defaults to `https://repairpilot-api.onrender.com`.
- Auth token is stored with Expo SecureStore.
- Draft diagnoses persist locally so a tester can resume after an app restart.
- Camera, PDF manual picker, data export/share, repair PDF sharing, password reset deep links, and account deletion are wired into the mobile client.
- iOS/Android native identifiers are set to `com.repairpilot.app`.

## Fastest first iPhone smoke test
Use Expo Go first. All native modules currently used by RepairPilot are supported by Expo Go. From the `mobile` directory:

```bash
npm install
npx expo-doctor
npx expo start --tunnel
```

Open the QR code with the iPhone camera and launch it in Expo Go. This first smoke test does not require creating an App Store build.

## Visual screen preview (no app build required)
From the `mobile` directory, run:

```bash
npm run preview
```

Open the QR code in Expo Go. Tap the amber monitor/eye button in the header to
switch directly among Home, Equipment, AI Diagnosis, Diagnostics, Scanner,
AR Assistant, Maintenance, and Account & Privacy. The amber preview banner is
always visible, sample display records remain local, and every backend write is
disabled.

For a specific first screen, run the Expo command directly, for example:

```bash
EXPO_PUBLIC_PREVIEW_MODE=true EXPO_PUBLIC_PREVIEW_SCREEN=diagnose npx expo start --tunnel
```

Set `EXPO_PUBLIC_PREVIEW_MODE=false` before normal account or backend testing.

## Native internal beta after the smoke test
The `preview` EAS profile uses internal distribution. For iOS this requires an Apple Developer account and a registered test device. When that point is reached:

```bash
npx eas-cli@latest login
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview
```

EAS will handle the ad-hoc provisioning flow. iOS 16+ devices must enable Developer Mode to run an internal distribution build.

## Test checklist
1. Launch and complete onboarding.
2. Log in with a beta tester account.
3. Load existing equipment.
4. Start a diagnosis and answer at least two steps.
5. Force-close/reopen and verify Resume restores the draft.
6. Take an equipment photo and verify the analysis response.
7. Upload a PDF manual and verify page indexing.
8. Save a `needs_work` repair, then a confirmed `fixed` repair.
9. Open Repair History and share a PDF report.
10. Export account data.
11. Verify password-reset deep link opens the reset screen.
12. Log out and back in.

Do not test account deletion with the primary beta account; use a disposable test account for that final check.

## V23 resilience checks
During the first phone test, also confirm:
- Taking a photo and choosing an existing photo both reach photo analysis.
- Repeated taps while RepairPilot is thinking do not create duplicate submissions.
- If the auth session expires, the app returns to Login and asks the user to sign in again instead of silently failing.
- A red/escalated diagnosis shows the STOP / ESCALATE panel and no diagnostic answer choices.
- New equipment can capture manufacturer, model, and serial before diagnosis begins.
