# CurvTab Dental 2.0 — Medical Aid Phase 7E.3 completion kit

## What is included

- `finish_medical_aid_7e3.py` — **additive** controller read endpoints, capabilities, allocation history, posting/reversal UI wired into the existing matching preview. It checks code markers before changing anything and backs up modified files. It **does not** enable settlement posting or alter PostgreSQL.
- `check_medical_aid_7e3.sh` — builds both apps and checks required markers, current and isolated database records, unique indexes, and unauthenticated protection. **Read-only.**
- `test_medical_aid_settlement_flow.py` — performs **real posting and reversal writes**, but only to an authenticated API on `127.0.0.1:8081`; requires **fictional test data** and an isolated admin session. It checks overpayment, concurrent allocation, idempotent replay, reversal, and history. It must **never** be run using actual practice data.

## Installation — run in Codespaces repository root

1. Copy/download the three files into the repository root (they are not required to be committed; you may move them under a local `scripts/` directory).
2. `python3 finish_medical_aid_7e3.py`
3. `dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj --nologo`
4. `cd frontend && npm run build && cd ..`
5. Restart the API bound to 8080 **after first stopping the old instance**. Keep `Features__MedicalAidSettlementPostingEnabled=false` (or unset) on port 8080.
6. Open `Checkout & Payments → Medical Aid → Remittance Matching → View settlement`. New **Settlement allocations** section displays history. Production UI says settlement posting disabled.
7. `bash check_medical_aid_7e3.sh`

## Isolated test preconditions

- Port **8080** uses `curvtabdb`, settlement disabled.
- Port **8081** uses `curvtab_settlement_test`, settlement initially disabled.
- Do not copy real patients, production cookies or actual medical records into the test database.
- Use the app's existing authentication and practice-provisioning workflow to create a **fictional practice and PracticeAdmin**, patient, consultation/invoice, medical aid membership, approved claim, remittance advice, bank receipt, and matched funds within `curvtab_settlement_test` only. The supplied snippets do not document those registration routes, so the kit intentionally does not invent or bypass them.
- Confirm a test-only authenticated `GET /api/finance/medical-aid/invoice-settlement/preview/{matchId}` returns 200 and a positive `maxAllocatable`.
- Once the test API's database and fictional session are independently confirmed, restart **only port 8081** with `Features__MedicalAidSettlementPostingEnabled=true`. Keep 8080 disabled. Do **not** modify production `appsettings.json` to turn the flag on.
- The test runner expects `TEST_MATCH_ID` (fictional match UUID) and `TEST_AUTH_COOKIE` (session cookie for fictional PracticeAdmin in the test API). Enter these securely using environment variables; avoid pasting cookie values into chat or commit history.
- `python3 test_medical_aid_settlement_flow.py`
- Verify audit events (`MEDICAL_AID_INVOICE_ALLOCATED`, `MEDICAL_AID_INVOICE_ALLOCATION_REVERSED`) and all normal invoice/credit-note reports after the test. The runner exercises the API and balance preview, **not every accounting view**.
- Stop 8081 or set its flag back to false after testing. Keep the normal API on 8080 disabled until financial review and bank reconciliation evidence checks are approved.

## Pass/fail criteria

**Pass:** frontend and backend build; allocation-history GET protected by authentication; normal API returns posting disabled; valid fictional posting recorded exactly once; two competing full-amount allocations yield one 201 and one controlled 409; repeated request id returns alreadyPosted; overpayment returns 409; reversal restores invoice funds; second reversal returns 409; audit events and invoice detail/list balances agree; existing `curvtabdb` remains unchanged.

**Fail / not production-ready:** any 500, unknown DB, missing audit, duplicate posting, mismatched balance, missing evidence, multi-tenant access leakage, or posting enabled on 8080.

## Important limitations

The scripts cannot certify a production application without access to the running Codespaces repository and authenticated fictional test fixtures. Approval statuses and remittance/bank receipt references are staff-entered, **not independently verified scheme or bank confirmations**. Before real deployment, complete security review, POPIA/privacy controls, tenant isolation tests, backup/restore exercise, patient communications opt-in policy, and financial sign-off. Avoid treating an equal amount or dummy evidence reference as proof of funds.
