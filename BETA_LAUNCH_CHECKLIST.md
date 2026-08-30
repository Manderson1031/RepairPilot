# RepairPilot External Beta Launch Checklist

## Infrastructure
- [ ] Hosted backend URL responds to `/health` and `/ready`
- [ ] Production secret configured
- [ ] OpenAI key stored server-side
- [ ] Production CORS origin configured
- [ ] Private object-storage bucket configured
- [ ] Database backups enabled
- [ ] Sentry/error reporting DSN configured
- [ ] HTTPS only

## Accounts
- [ ] Admin account created
- [ ] Beta invite generation tested
- [ ] Password-reset email tested end-to-end
- [ ] Account export tested
- [ ] Account deletion tested including stored photos/manuals

## Repair safety
- [ ] CI passes
- [ ] Safety regression suite passes
- [ ] At least 20 representative small-engine cases reviewed
- [ ] At least 20 representative hydraulic cases reviewed
- [ ] At least 20 representative control/electrical cases reviewed
- [ ] Red escalation queue tested

## Mobile
- [ ] EXPO_PUBLIC_API_URL points to hosted beta API
- [ ] iPhone camera upload tested
- [ ] Android camera upload tested
- [ ] PDF manual upload tested
- [ ] Close/reopen diagnosis resume tested
- [ ] PDF report sharing tested
- [ ] Privacy/safety onboarding visible

## Beta operations
- [ ] Start with 10–20 invited testers
- [ ] Review every Red escalation during early beta
- [ ] Review low-rated/failed repairs
- [ ] Track successful-repair rate and unresolved cases
- [ ] Do not expand tester count until dangerous-advice rate is acceptably low
