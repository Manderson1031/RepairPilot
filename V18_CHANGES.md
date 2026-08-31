# RepairPilot V18 changes

## Account and invite correctness
- Registration now creates the user and consumes the beta invite in one database transaction.
- PostgreSQL registration locks the invite row while it is being consumed, preventing concurrent over-use of single-use invites.
- Duplicate-account registration no longer burns an invite use.
- The standalone invite-consumption helper now uses an atomic conditional update.

## Password reset fix and hardening
- Fixed a production bug where password reset confirmation referenced an undefined `PWD` object.
- Password reset now uses RepairPilot's PBKDF2 password hashing function correctly.
- Newly issued password-reset tokens are stored as SHA-256 hashes instead of raw reset credentials.
- A new reset request invalidates older unused reset tokens for the same account.
- V18 still accepts a legacy V17 raw reset token once so an already-issued link is not broken during deployment.

## Diagnostic and repair integrity
- Existing equipment records are now authoritative during diagnosis; a client cannot submit different manufacturer/model details while referencing a stored equipment id.
- A client-supplied diagnostic session id can no longer collide with or overwrite another user's session.
- JWTs are now checked against the live account record on every authenticated request, so deleted accounts and role changes take effect immediately.
- Added per-account token versions; changing a password invalidates previously issued login tokens.
- Feedback now verifies that the referenced diagnostic session belongs to the signed-in user.
- Saving a repair with an equipment id that does not belong to the signed-in user now returns `404 Equipment not found`.

## Mobile diagnosis flow
- Added the missing answer input for measurement and free-text diagnostic steps. Previously the UI only rendered choice buttons, making measurement steps impossible to continue.
- Measurement steps now show the requested unit and use the numeric keyboard where available.
- Fixed repair feedback so it submits the diagnostic `session_id` instead of the equipment id.
- Added explicit **Fixed** vs **Still needs work** save actions so RepairPilot does not infer the diagnostic outcome from free-text notes.
- The production Render API URL is now the mobile fallback, so a beta build does not accidentally call `127.0.0.1` when no Expo environment override is present.
- Preserves the completed session id before clearing diagnosis state, so post-repair feedback remains attached to the correct diagnostic session.
- Mobile app version bumped to 0.13.0 / build 13.

## AI routing and safety
- Updated default model routing to the current GPT-5.6 family: Luna for routine early steps, Terra for normal work, and Sol for difficult/high-consequence diagnostics; environment variables can override each tier.
- Vision defaults to GPT-5.6 Terra.
- Red risk is now a hard invariant: any red response is converted to `escalate` with no actionable next step.
- Improved demo electrical flow so a user without an already-obtained energized reading is escalated instead of being led into a live test.

## PostgreSQL hardening and performance
- Added indexes for `blobs.user_id`, `feedback.user_id`, `password_reset_tokens.user_id`, and `review_queue.user_id`.
- Explicitly revoked `PUBLIC`, `anon`, and `authenticated` access to the private `repairpilot` schema/tables. RepairPilot continues to use its server-side PostgreSQL connection for application data.
- The same hardening/index migration was applied successfully to the production Supabase project.
- Added `users.token_version` to production for immediate session invalidation after password changes.

## Verification
- 23 backend tests pass with a local SlowAPI test shim (the runtime environment does not have SlowAPI installed and has no package-index network access).
- Dependency-independent backend suites pass without the API shim.
- `/ready` now verifies live database reachability and storage configuration instead of always returning ready.
- Python `compileall` passes.
- TypeScript/TSX syntax transpilation passes.
- Release preflight: 16 passed, 1 expected warning, 0 failures. The warning is that privacy/terms still require owner/counsel review before public release.
- Supabase security advisor reports no active security lints after the V18 database migration.
