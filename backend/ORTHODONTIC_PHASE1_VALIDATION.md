# Orthodontic Intake Phase 1 — acceptance gate

Source: CurvTab Orthodontics Phase 1 Revised Developer Guide (11 November 2026).

## Verified on isolated Neon validation branch
- Additive OrthodonticIntakes schema created, with tenant/patient reference and source constraint.
- One open intake per patient constraint rejects a duplicate insert.
- Test rows removed; 10 existing copied patients unaffected.
- Registration now queues the same patient ID, without treatment, payment or instalments.
- Authenticated dentist queue and treatment case APIs are scoped to their assigned intake.
- Source types: DIRECT (registration), INTERNAL (dentist referral), TRANSFER_IN (reception).
- Old classifications can be queued once with administrator sync.

## Acceptance checks still required before clinical production sign-off
- [ ] Authenticated end-to-end role, tenant and concurrent creation tests.
- [ ] Full production deployment/migration verification.
- [ ] Secure long-term X-ray/photo/doc upload and associated provenance.
- [ ] Legal approval of guardian electronic intake and advance-payment wording.
- [ ] Signed full document PDF retrieval with evidence integrity.
- [ ] Real R2,500 advance through the existing ledger and one receipt/day-close posting.
- [ ] Transfer-in fee/waiver policy and assignment delegation approved by client.
- [ ] No treatment contract or instalment automatically activated at intake.

Build jobs on this PR validate .NET/TypeScript and discover the migration, but do not replace clinical acceptance.
