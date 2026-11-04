# CurvTab Dental Phase 8A — WhatsApp foundation (mock-only)

Based on the uploaded 840-line code inspection of `Program.cs`, `DentalDbContext.cs`, `Appointment.cs`, `Patient.cs`, and frontend app references.

## What this installs

- A separate explicit patient WhatsApp opt-in/opt-out record (not reused from general POPIA consent).
- Tenant-filtered opt-in and mock outbound reminder records with DB uniqueness for appointment/template.
- Authenticated `GET /api/whatsapp/capabilities`, `GET/PUT /api/whatsapp/consents/{patientId}`, `GET /api/whatsapp/messages`, and `POST /api/whatsapp/mock-reminders`.
- A settings panel in the existing `App.tsx` practice-settings view.
- **No WhatsApp Cloud API calls, no background sends, no live delivery webhooks.** Queued items are labeled `MockQueued`, never `Sent`.

## Installation and migration safety

1. Back up the repo and inspect `git status --short` before installing.
2. Unzip the kit outside the repo if desired, then from the repository root:

   `python3 /path/to/curvtab_whatsapp_phase8a/install.py`

3. Build both projects:

   `dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj --nologo`

   `(cd frontend && npm run build)`

4. Generate migration (does **not** touch database):

   `dotnet ef migrations add Phase8AWhatsAppMockFoundation --project backend/CurvTabDental.Infrastructure --startup-project backend/CurvTabDental.API --context DentalDbContext`

5. **Review the migration source and snapshot**. The expected schema additions are precisely `WhatsAppConsents` and `WhatsAppOutboundMessages`, related indexes/foreign keys, with no changes or drops to existing tables. If unexpected changes appear, do not apply.
6. Apply **only to disposable test database** (from Codespaces, use the tested database connection string):

   `dotnet ef database update --project backend/CurvTabDental.Infrastructure --startup-project backend/CurvTabDental.API --context DentalDbContext --connection 'Host=localhost;Port=5432;Database=curvtab_settlement_test;Username=curvtab;Password=curvtab123'`

7. Restart **only the test API** port 8081, with the previously verified test connection string, while retaining `Features__MedicalAidSettlementPostingEnabled=false` and no live WhatsApp credentials.
8. Test authentication (`401` unauthenticated), tenant isolation, consent grant/revoke, queue rejection without consent, duplicate queue rejection, cancellations, and archived patients. The database unique index is the final concurrent duplicate defense. No data should be sent.
9. Only after review, backup, and successful verification apply the migration to the practice database in a controlled maintenance window. Do not run `docker compose down -v` or reset the existing database.

## Known limitations / Phase 8B requirements

- No provider integration, background reminder scheduler, template approvals, callback signature verification, delivery state machine, patient reply or confirmation workflow, retry system, queue expiration, or live consent-evidence capture. These require further implementation and testing.
- Opt-ins are recorded by staff with a free-text evidence source; production must require an auditable, verifiable permission process and opt-out handling. Captured phone numbers remain private in API responses.
- Mock `POST` uses one message row per appointment/template. Later automatic scheduler must add stronger per-schedule idempotency and concurrency handling.
- The installed panel uses explicit patient/appointment IDs to avoid guessing application-specific patient selectors; Phase 8B will integrate selectors into existing appointment and patient pages.
- No secrets or third-party credentials are included in the kit.

## Reverting uncommitted installation

The installer backs up `DentalDbContext.cs` and `App.tsx` under `.curvtab-clinical-backups/whatsapp-phase8a-.../`. Revert only these two edited files using their backups; delete the five newly added files after confirming they have no edits. If a migration was generated, review and remove it with `dotnet ef migrations remove` **only if not applied**.
