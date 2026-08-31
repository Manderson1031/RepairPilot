# RepairPilot V22 — Mobile Beta Build Readiness

## Expo SDK 57 dependency alignment
- Updated `expo-image-picker` from the older `~18.0.0` line to the SDK 57 compatible `~57.0.13`.
- Updated `expo-document-picker` from the older `~15.0.0` line to `~57.0.1`.
- Pinned `expo-secure-store` to `~57.0.2`.
- Kept SDK 57-compatible file system, sharing, linking, AsyncStorage, React and React Native versions already in the project.

## Native permission hardening
- Added the official `expo-image-picker` config plugin.
- Added a RepairPilot-specific camera permission message.
- Disabled the unused microphone permission so Android does not request `RECORD_AUDIO` for camera/image-picker use.
- Let the image-picker plugin own the Android camera permission rather than duplicating it manually.

## Build/version readiness
- Mobile app version: 0.14.0.
- iOS build: 14.
- Android versionCode: 14.
- Mobile package: 0.7.0.
- Added an `appVersion` runtime-version policy for future OTA compatibility.
- Added `doctor`, `check`, and EAS preview build scripts.

## Device-test handoff
- Added `mobile/BETA_DEVICE_TEST.md` with a staged Expo Go smoke test followed by the EAS internal iOS build path.
- This keeps the first real-device test lightweight while preserving a clean path to ad-hoc/TestFlight distribution.

Backend remains V21 / API version 0.9.3 because this release changes only mobile build readiness.
