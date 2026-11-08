# CurvTab Dental — laboratory exchange & clinical closure (V1)

Implementation aligned to the uploaded **Laboratory Dispatch, Chain of Custody & Clinical Completion**, reviewed v1.1, ten screens. The sample patient names, laboratory IDs, photos and dates in the guide are **illustrative** and are not preloaded into the clinical database.

## Scope

The Laboratory navigation presents ten connected workbenches:

1. Reception dispatch queue from a dentist-signed laboratory prescription. Multiple items on one order; separate manifests by destination lab.
2. Prepared manifest versus physically confirmed collection/handover (collector, package count, acknowledgement, waybill).
3. Laboratory confirms item-level physical receipt separately from impression acceptance/rejection.
4. Rejected impressions: dentist records actual replacement under original order. Reception resends separately.
5. Laboratory reports item-by-item manufacture stages and delays, and expected completion.
6. Laboratory groups finished items into an outgoing manifest, then confirms real physical handover.
7. Practice receipt and item inventory are separate from dentist's quality assurance.
8. Dentist only fits QA-passed items; a new tooth-chart observation is appended without replacing earlier observations.
9. Dentist-approved QA failure / failed fitment allows per-item redo, linked to original order. Three completed items are not reset for one failed item.
10. Dentists clinically close a case only when all original items have passed QA and fitment, and a removable appliance has actually been handed to the patient.

Evidence: photo/PDF upload, server-side signature validation, limit 8 MB, per-item access control. Evidence bytes are stored in PostgreSQL and included in database backups; the user must ensure appropriate retention and access policies before real-world rollout. No new financial tables, invoices, refunds or patient charges are created.

## Access

Practice admin: configure laboratory partners and map a lab-technician staff account to exactly the intended partner(s), dispatch, physical receipt, removable appliance handover.

Receptionist: prepare dispatch, physical handover and receipt.

Dentist: prescribe, document impression corrections, perform QA, record clinical fitment, prescribe redo, clinical closure.

LabTechnician: laboratory receive/intake, production, outgoing manifests and evidence for **explicitly assigned laboratory partner** only. The installer tightens existing `LabTechnician` API access through the active-user middleware. **Never send a partner account password to a real external lab until you have reviewed existing role policies, completed POPIA/privacy review, verified authorization in staging, and added secure onboarding.**

## Important constraints and known integration boundaries

- Uses the practice's existing Identity cookie authentication and existing `apiRequest` rather than new passwords/tokens.
- Retains optional `TreatmentPlanId` but does not claim that this linkage is clinically verified. Laboratory prescriptions must currently be created by an authenticated dentist. Full prefill from an approved treatment-plan procedure is an additional integration task.
- Evidence files are stored with the lab module and linked to items, rather than copied from existing Clinical Images. This prevents automatic sharing of unrelated clinical images.
- "Manufacture complete" is a technician-recorded state; independent practice clinical QA and dentist fitment are required for closure.
- No WhatsApp, SMS, email or SignalR notifications are sent automatically. Work queues/timeline update on refresh; adding real notifications is a separate integration.
- This V1 supports partial physical receipt. It does not automatically confirm external courier identities or cryptographically sign handovers.
- A partner staff account can be mapped to multiple labs in the SAME practice by a practice admin; only orders assigned to mapped labs are visible in the laboratory controller.
- Script does not restore lost historical patient records or source files, and does not seed fictional patients in the live system.
- User-facing status and events are stored, but healthcare deployment requires fuller tests of concurrent requests, privacy policies, data retention, audit review, role provisioning and external partner contracts.

## Suggested acceptance test (nonpatient demo data only)

Create partner Patric Lab and Ralph Lab as practice admin. Dentist adds two new laboratory orders to DIFFERENT labs: 4 gold inlay items 14, 15, 24, 25 to Patric, and a gold cap tooth 16 to Patric (or a third order to Ralph). Reception selects items across labs and prepares separate manifests; verify all items still show `AtPractice`. Reception confirms physical handover of one manifest; confirm only its items are `InTransitToLab`. Assigned LabTechnician confirms receipt item by item and inspects accepted / rejected impression cases separately. For Lethiba, progress all four items through manufacture, create Patric → Practice manifest, confirm physical handover and practice receipt, then dentist QA passes 14/15/24 and fails 25. Dentist fits 14/15/24; closure must be blocked. Dentist issues redo for 25; physically dispatch and return only 25, then repeat manufacture → receipt → practice QA → fitment and close original order. Verify activity history and 0 new financial transactions. Repeat with removable item to verify patient handover is required before closure.

## Backup / rollout

Installer backs up current DB and entire project BEFORE adding files, restores/builds API and frontend, generates one EF migration, refuses to apply destructive migrations and uses the running Docker Compose API service to rebuild. A fully green build alone is NOT a substitute for role-based end-to-end testing with demo patients.
