# RepairPilot Account Data Controls

V10 adds backend endpoints for tester data portability and deletion.

## Export

`GET /account/export`

Requires the logged-in user's bearer token.

Returns a JSON package containing:
- account metadata
- equipment profiles
- saved repairs and diagnostic history
- manual metadata
- image-analysis metadata
- feedback
- review-queue cases
- audit history

Original private binary files are not embedded in the JSON export in this prototype.

## Delete

`DELETE /account`

Deletes the user's application records and account from the V10 database.

For a production service using cloud object storage, the next step is to also enumerate and permanently delete that user's stored photo/manual objects from the private storage bucket.
