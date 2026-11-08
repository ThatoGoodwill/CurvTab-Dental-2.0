CURVTAB LABORATORY — WORKBENCH V3
================================

No sample lab partners, patients, tooth items, prices, dates, or statuses are added.
This replaces the React lab interface only. It uses the existing Laboratory V1 API,
real PostgreSQL records and role-gated actions. It does not alter the database.

GOAL
A single professional lab workspace with:
  • real laboratory order list, searchable
  • linked tooth/appliance details and status axes
  • authorised actions for physical dispatch and receiving
  • lab partner inspection, manufacture and shipment
  • dentist-only QA, clinical fitment, correction/redo and closure
  • audit history, linked evidence, manifolds, no duplicate finance ledger
  • no ten numbered guide screens or demonstration patients
  • coherent light cards and readable text inside dark host theme

INSTALL
1. Upload the ZIP file into your Codespaces project root.
2. Run:
   cd /workspaces/CurvTab-Dental-2.0 && unzip -oq CurvTab-Laboratory-Real-Workbench-V3.zip && bash lab-v3-installer/install.sh
3. Refresh your existing frontend URL. No API restart is necessary.

The installer retains current Lab source backups in
/workspaces/.curvtab-safe-snapshots/laboratory-before-v3-<UTC timestamp>
and restores the files automatically if the React build fails.

OPERATIONAL SETUP
- Sign in as PracticeAdmin and add the actual laboratory partner.
- Staff Management must have an active LabTechnician role before assignment.
- Sign in as Dentist, prescribe from a registered patient.
- Reception dispatches; lab partner receives, inspects, manufactures,
  and ships; receptionist receives; dentist performs QA, fitment and close.

No client patient data should be entered for testing before privacy, role,
concurrency, audit and workflow acceptance tests have been completed.

VERIFICATION
Frontend React build is checked in your Codespace by the install script.
Production authorization, data integrity, concurrency, and manual end-to-end
workflow acceptance must be tested separately before live clinical use.
