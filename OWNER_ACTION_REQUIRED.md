# RepairPilot — First Point Where Owner Action Is Required

The local product-development work can now proceed no further into a real hosted beta without user-owned external accounts or credentials.

## The first required owner action

Create or connect a **Supabase project** for RepairPilot.

RepairPilot needs two things from that project:
1. a managed Postgres database connection string;
2. a private Storage bucket for equipment photos and manuals.

Create the bucket with this name:

`repairpilot-private`

Do **not** send service-role credentials in ordinary chat text if there is a secure connector/secret-entry method available. Production secrets belong in the hosting provider's secret/environment-variable system.

## After Supabase

The remaining owner-controlled setup is:

- OpenAI API account/key for server-side diagnosis and photo analysis
- API hosting account (the package includes a Render manifest, but another Docker host can be used)
- Resend or another transactional-email account/domain for password resets
- Sentry or another error-reporting account
- Expo/EAS account
- Apple Developer Program account for TestFlight
- Google Play Console account for Android internal testing
- a final product/domain name decision for public URLs and reset-email sender
- legal review of the supplied privacy/terms drafts

## What is already prepared before asking you

- deployable Docker backend
- SQLite and Postgres data layer
- production Postgres schema
- private-storage integration
- environment templates
- server secret generator
- password reset flow and mobile deep link
- mobile persistent login
- mobile account export/delete
- diagnostic session persistence
- unresolved/fixed beta analytics
- automated safety regression tests
- GitHub CI with a PostgreSQL smoke-test job
- backups/restore scripts
- iOS/Android application identifiers and EAS profiles
- TestFlight/Google internal-testing instructions
- release preflight script

Once the Supabase project exists and can be connected/configured, deployment can continue.
