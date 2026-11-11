# CurvTab Dental — 11 November 2026 client implementation guide acceptance register

Source: `CurvTab_Dental_Billing_Medical_Aid_Developer_Implementation_Guide.pdf`, pp. 2–21.

This register distinguishes **source implementation**, **isolated automated verification**, and **manual production sign-off**. Passing a build is not acceptance. Never seed these fictional figures into real patient or payment records.

## Frozen fictional fixture (10 November 2026, in test practice only)

- Cash receipts: R3,000; card: R4,000; EFT: R1,450; actual receipts: **R8,450**.
- Cash expenditure: gloves R250; Patric Lab R600; total outflows: **R850**.
- Net **movement**: R8,450 − R850 = **R7,600**, not profit.
- Opening float: R500; expected cash: R500 + R3,000 − R850 = **R2,650**.
- First blind physical count: R2,600; original shortage **R50**.
- Seven original medical-aid submissions totalling **R6,000**, distinct from money received.
- Sipho `CLM-1045` original claim **R900**, later rejected; Kabelo R800 review.
- Later claim rejections/resubmissions must NOT rewrite the signed 10 Nov snapshot.

## Acceptance tests (14)

| # | Verification on actual API and isolated PostgreSQL | Current finding |
|---|---|---|
| 1 | Reception sidebar includes employee Workspace, not Staff Management; manager sees Staff Management; employee API cannot read others | **Not implemented in this change** |
| 2 | Ledger receipts R8,450 while claim submissions show R6,000 without increasing receipts or physical drawer | Source separation exists; DB fixture test pending |
| 3 | Blind count GET hides expected R2,650 until R2,600 saved; cash expense R850 counted exactly once | API guard exists; DB fixture test pending |
| 4 | R50 shortage immutable through manager approve/reject/escalate and recount history | Existing append-only count and review; DB fixture test pending |
| 5 | Card R4,000 and EFT R1,450 evidence each matched by external reference; mismatch blocks sign-off | **New evidence API**; requires bank/terminal integration verification |
| 6 | Signed financial day snapshot independent; medical-aid review still pending | **New independent financial sign-off**; DB fixture test pending |
| 7 | Seven distinct original submissions R6,000; missing medical-aid encounter exceptions flagged | Original submissions distinct in code; encounter test pending |
| 8 | Medical Aid review freezes submission facts without posting receipts or marking paid | Existing independent claims sign-off; DB test pending |
| 9 | Rejected Sipho R900 retains original invoice, code, first attempt and signed 10 Nov snapshot | Claim event history exists; verify code linkage |
| 10 | Clinical correction requires authenticated Dentist; attempt two no additional charge or receipt | Role check implemented; verify code against clinical price book and DB tests |
| 11 | Bank remittance/idempotent matching allocates one receipt; retry never duplicates | Existing matching; DB replay test pending |
| 12 | Co-pay not automatically patient debt; adjudication/liability decision required | DB and clinical-policy test pending |
| 13 | Lab payout posted once; partner acknowledgment does not create expense | Shared expense endpoint; integration test pending |
| 14 | Tenant isolation, role restrictions, audit events and concurrent edits tested using real API/DB | **Not yet proven** |

## Financial reconciliation test details

1. Record physical count as Reception: GET must not reveal `ExpectedCash` before submit.
2. Submit first count: original counted, expected and variance must be R2,600, R2,650 and -R50; retry must not create a new count.
3. Record card external R4,000 and EFT R1,450 with separate real external evidence references. These are external *staff assertions*, not independent bank verification.
4. Record a mismatch (e.g. terminal R3,999) on a separate test date; sign-off must return 409 and must not create a balancing receipt.
5. Confirm expense totals include gloves and lab payout **once**, and payments are not mutated.
6. Submit financial sign-off with expense/refund/lab source-review attestations. Assert immutable snapshot and no change to claims sign-off.
7. Reuse request ID: identical request is safe; changed request with same ID rejected.
8. Simultaneous duplicate posts must be blocked by DB unique indexes (not just client disabled buttons).
9. Verify 401/403 and cross-tenant 404/403 on every endpoint.

## Release blockers

- Verify external card and EFT settlement from actual bank/terminal sources, rather than relying on staff-only attestations.
- Confirm that supplier and laboratory payouts arise from one authoritative practice movement, including refunds and advanced plan allocations.
- Build the separate personal employee Workspace with self-only roster, leave, payslips, contracts and attendance plus management-only controls.
- Enforce Dentist's clinical code against original documented clinical procedure and price-book code.
- Complete automatic database and application acceptance tests and browser screenshot evidence for all 16 screens.
- Check migration and snapshot against a **throwaway PostgreSQL database** before any production migration.
- Back up the actual production database before a reviewed, approved release.

No claims, invoices, receipts, cash counts or payroll data should be created in production for testing.
