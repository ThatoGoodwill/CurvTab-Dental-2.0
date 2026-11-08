CURVTAB DENTAL 2.0 — LABORATORY EXCHANGE AND CLINICAL CLOSURE V1

Prepared against the source archive curvtab-rebuild-source.zip, the supplied
Laboratory Exchange and Closure Guide v1.1 (10 conceptual screens), and the
current described Codespaces environment.

INSTALL:
1. Download CurvTab-Laboratory-One-Command-Installer.zip.
2. Upload the ZIP into the GitHub Codespaces folder /workspaces/CurvTab-Dental-2.0.
3. Run:

cd /workspaces/CurvTab-Dental-2.0 && unzip -o CurvTab-Laboratory-One-Command-Installer.zip && bash curvtab-laboratory-complete-installer-v1.sh

DO NOT RUN if your emergency backup has not been stored securely outside
Codespaces. The script also creates a new full local snapshot and database dump.

What it installs:
10 role-based Laboratory screens, persistent lab orders with multiple tooth
items, laboratory partners and assignments, separate dispatch manifests by
lab, physical handover, receiving and discrepancies, lab intake reject /
accept, dentist impression correction, manufacturing stages and due dates,
practice QA, dentist fitment and chart observations, single-item redo under
the same original order, evidence photo/PDF attachments, append-only custody
history, removable handover and checked final closure. No independent lab
financial ledger or automatic patient invoice is created.

The installer backs up live data, patches only the relevant source files,
builds API and frontend, generates an Entity Framework Core migration, refuses
non-additive operations, and rebuilds the running API without deleting DB
volumes. It stops on error and tells you where the backup is stored.

Important limitation: This package passed Bash syntax, embedded-archive
integrity, source-patcher and TSX syntax tests against the supplied source.
The full .NET/React integration build and database migration MUST run and be
verified in your Codespace. This is not proof of live deployment. It does not
restore patient records lost with the prior Codespace. It also does not yet
implement notification delivery or automatic linking/prefill from an
existing treatment plan.

Do not send real patient data or external partner logins until you have tested
tenant isolation, access privileges, consent and appropriate POPIA compliance.
Do not share the sensitive private backup in ChatGPT or public Git.

If the script prints STOP, save the last 40 terminal lines and investigate
before running it again. Applying migrations twice without diagnosis is risky.
