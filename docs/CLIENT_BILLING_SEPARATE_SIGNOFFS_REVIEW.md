# Client Billing — Independent Daily Sign-offs (10 November 2026)

This implementation follows **CurvTab_Billing_Separate_Signoffs_Developer_Guide.pdf** (14 pages). The approved screenshots are layout references, not accounting source data. These workflows **must be validated before merging or deploying**.

## Role-specific sidebar

- Dashboard
- Scheduling
- Patients
- Billing (single collapsible parent)
  - Today's Billing
  - Cash & Private
  - Medical Aid
  - Cash Day Close
  - Medical Aid Day Sign-Off
- Lab
- Staff Management (PracticeAdmin)
- Finances (PracticeAdmin / Finance role)
- Settings and Profile (role-permitted)

Clinical Calm theme tokens, logo and existing modal shell are reused. Existing patient, queue, doctor and laboratory modules stay operational.

## Financial source boundaries

| Event | Financial receipt? | Recorded where |
|---|---|---|
| Medical-aid claim draft/submission/rejection/correction/resubmission | **NO** | `MedicalAidClaim` + versioned `MedicalAidClaimEvent` |
| Remittance advice received | **NO** | `MedicalAidRemittanceAdvice` |
| Real scheme bank receipt + reconciled match | **YES, once** | `MedicalAidBankReceipt` + `MedicalAidRemittanceMatch` into finance ledger |
| Patient cash/card/EFT payment | **YES, once** | `Payment` or `PlanPayment` |
| Practice expense from Billing/Finances | **Outflow, once** | `PracticeExpense`, idempotent `RequestId` |
| Physical cash count | **NO new receipt** | `CashDayCloseSubmission` (immutable) |
| Cash approval/rejection/escalation and recount | **NO new receipt** | `CashDayCloseReview`, `CashDayCloseAdjustment` |
| Medical-aid daily sign-off | **NO new receipt** | `MedicalAidDaySignoff` immutable snapshot |

**Never** re-enter the same laboratory payout into `PracticeExpense` if already posted elsewhere. Cash close only includes existing authoritative cash `Payments`, `PlanPayments` and cash `PracticeExpense`. Refunds and standalone laboratory payouts without a `PracticeExpense` movement are **not automatically inferred**; reconcile these sources before approving.

## Baseline acceptance fixtures (do not seed into production)

- Cash opening float R500 + cash receipts R3,000 − gloves R250 − laboratory cash payout R600 = **R2,650 expected**.
- Blind counted R2,600 ⇒ **R50 shortage**, pending manager explanation/evidence, review and possible controlled recount.
- Card actual receipts R4,000 and EFT actual receipts R1,450 are shown separately from physical cash.
- Medical-aid activity: **7 unique claims, R4,200 submitted value, R0 actual scheme receipts** that day.
- One claim R800: submitted 10 November → rejected 12 November → corrected/resubmitted 13 November (a second versioned attempt, not a second invoice) → real scheme remittance recorded on 20 November.
- An R700 remittance against R800 **must not** automatically create R100 in patient copayments. The difference needs a separate explicit financial decision.

## API references

- `GET /api/billing/cash-day-close?date=YYYY-MM-DD` hides expected amount until count is submitted.
- `POST /api/billing/cash-day-close/submit-blind-count` submits the first immutable physical count.
- `POST /api/billing/cash-day-close/{submissionId}/review` records PracticeAdmin approval/rejection/escalation.
- `POST /api/billing/cash-day-close/{submissionId}/recount` appends audited correction after rejection.
- `GET /api/billing/medical-aid-day-signoff?date=YYYY-MM-DD` returns operational submissions, not cash.
- `POST /api/billing/medical-aid-day-signoff` freezes an immutable daily snapshot; retries do not create second records.
- `POST /api/finance/medical-aid/claims/{claimId}/workflow/transition` handles status events with required evidence, actor and idempotency key.
- `GET /api/finance/ledger` includes actual reconciled scheme bank transfers, not submitted claim values.
- The old `POST /api/finance/operations/signoff` returns HTTP 410; previous historical cash snapshots remain readable.

## Before production approval

1. GitHub Actions must pass frontend TS/Vite and .NET API builds, plus migration application in isolated PostgreSQL.
2. Exercise receptionist/PracticeAdmin roles using a separate test database with two tenants.
3. Verify first count hidden expected amount, immutable original, changing ledger after submission blocks approval, manager rejection and append-only recount.
4. Verify rejected claim correction and distinct attempt IDs, event history, idempotent retries, no new invoice.
5. Verify remittance matching/partial settlement and bank receipt date vs claim submission date.
6. Verify user permissions, CSRF, audit logs, snapshot immutability after later events, and printable evidence references.
7. Capture browser screenshots of all five Billing pages in Clinical Calm Dark and confirm details with the client.

## Known limitations / explicit future work

- No live insurer clearinghouse integration; processing state is staff-reported.
- Expense evidence is stored as a **reference**, not a binary uploaded file.
- Refund and lab supplier cash payouts require an authoritative expense/outflow entry before closing; no invented deductions.
- The current manager review supports immutable decision/recount history; automatic workflow for bank chargebacks, scheme write-off approval and advanced exception queues is not implemented.
- **No production deployment is authorised by this implementation.**
