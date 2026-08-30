# RepairPilot V9 Deployment Guide

## Backend environment variables

Never commit the real `.env`.

Required for production:
- `REPAIRPILOT_ENV=production`
- `REPAIRPILOT_SECRET=<long random secret>`
- `REPAIRPILOT_ALLOWED_ORIGINS=<comma-separated frontend origins>`
- `OPENAI_API_KEY=<server-side only>`

Optional:
- `REPAIRPILOT_RATE_LIMIT=60/minute`
- `REPAIRPILOT_MAX_IMAGE_MB=12`
- `REPAIRPILOT_MAX_PDF_MB=30`
- `REPAIRPILOT_STORAGE_BACKEND=supabase`
- Supabase URL/service role/bucket variables

## Cloud storage

Set `REPAIRPILOT_STORAGE_BACKEND=supabase` to route original uploaded photos/manual PDFs into a private Supabase Storage bucket.

The service-role key is server-side only. Do not put it in the Expo app.

## Database

V9 introduces numbered SQL migrations. They run automatically at backend startup and are recorded in `schema_migrations`.

SQLite remains appropriate for a small single-instance private beta. Before horizontally scaling the API, move application records to Postgres.

## Mobile API URL

The Expo app reads:

`EXPO_PUBLIC_API_URL`

Example:
`EXPO_PUBLIC_API_URL=https://api.repairpilot.example`

This is intentionally public; it is only the backend URL, not a secret.

## EAS environments

`mobile/eas.json` defines development, preview and production build environments. Configure `EXPO_PUBLIC_API_URL` separately for each environment through EAS.

## Security now included

- production secret requirement
- restricted CORS origins
- bearer-token auth
- invite-only beta registration
- 30-minute reset-token expiration
- upload-size limits
- per-IP rate limiting
- file type checks
- server-side API keys
- audit events
- user ownership checks

## Still needed before a public launch

- real transactional email for password reset
- managed Postgres
- production object-storage lifecycle/backup policy
- malware/file scanning
- account deletion/export
- privacy policy and terms review
- Sentry or equivalent crash/error ingestion
- App Store/Play privacy disclosures
- deeper safety testing with domain experts
