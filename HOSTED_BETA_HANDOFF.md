# RepairPilot Hosted Beta Handoff

V12 contains the configuration needed for the next real-world step, but it does not deploy itself because production accounts, domains, API keys, billing accounts, Apple credentials, and Google credentials must belong to the product owner.

## Required external services
1. API host capable of Docker deployment.
2. Managed Postgres.
3. Private object storage for photos/manuals.
4. OpenAI API account/key.
5. Transactional email provider.
6. Error-reporting service.
7. Expo/EAS account.
8. Apple Developer account for TestFlight.
9. Google Play Console account for Android internal testing.

## Secrets
Keep these server-side only:
- OPENAI_API_KEY
- REPAIRPILOT_SECRET
- DATABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- RESEND_API_KEY
- SENTRY_DSN

The mobile app receives only the public RepairPilot API URL.

## Launch gate
Do not widen the beta until:
- safety regression tests pass,
- account deletion works,
- backups are enabled,
- Red escalation is reviewed,
- privacy/terms text has been professionally reviewed,
- representative real repairs show an acceptable successful-diagnosis rate.
