# Orthodontic Phase 1 integration validation

Based on CurvTab Orthodontics Phase 1 Revised Developer Guide (11 Nov 2026).

Automated checks on this branch compile the current .NET backend and React TypeScript frontend.

Implemented:
- Existing registration classification -> unique DIRECT intake linked to the same patient.
- INTERNAL clinical referral and TRANSFER_IN intake with required former provider and reasons.
- Assignment-scoped specialist queue and treatment records.
- Versioned intake document signing, with guardian identity check and PDF + PNG evidence retrieval.
- Immutable 4 MB PDFs/JPEGs/PNGs in tenant-filtered database document table, with SHA-256 validation on download.
- R2,500 standard advance only when agreed intake terms are captured; payment written once as an existing Payment receipt against an appointment.
- Receipt entry is not automatic card charging or EFT verification.
- Clinical readiness requires specialist history verification and uploaded evidence; payment alone never marks ready.
- Source/provider details preserved, no duplicate registration and no automatic final braces treatment plan or instalments.

Pre-production blockers:
- Actual legally approved advance/consent terms from client.
- Decision on transfer-in advance amount/waiver.
- Full role-based authenticated browser and adverse-case tests.
- Verify all receipt-to-day-close and payment allocation (credit toward future accepted quote).
- Malware scanning and external secure document storage policy for high-volume use.
- Confirm patient-consent and POPIA retention policies with practice.
