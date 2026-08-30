# RepairPilot V12 — TestFlight & Google Play Internal Build Guide

## 1. Configure Expo/EAS
From `mobile/`:

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

Set the hosted API URL in the EAS `preview` and `production` environments:

`EXPO_PUBLIC_API_URL=https://YOUR-REPAIRPILOT-API`

No server secret or OpenAI key belongs in the Expo environment.

## 2. iPhone external/internal beta

RepairPilot uses bundle identifier:

`com.repairpilot.app`

Build:

```bash
eas build --platform ios --profile preview
```

For App Store/TestFlight production distribution:

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Before submission:
- Apple Developer account active
- App Store Connect app record created
- camera usage description reviewed
- privacy answers completed
- beta description/test notes completed

## 3. Android internal testing

Package:

`com.repairpilot.app`

Build:

```bash
eas build --platform android --profile production
eas submit --platform android --profile production
```

Before submission:
- Play Console developer account active
- application record created
- internal testing track selected
- Data Safety form completed
- privacy policy URL supplied
- tester email list/group configured

## 4. First beta cohort

Do not begin with a public listing.

Recommended first cohort: 10–20 people who regularly repair equipment.

Track:
- diagnoses started
- diagnoses completed
- confirmed fixes
- failed fixes
- Red escalations
- tester rating
- manual/photo usage
- cases where the app gave an unclear next test

Review early failures manually before expanding the cohort.
