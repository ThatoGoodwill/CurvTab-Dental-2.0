CURVTAB DENTAL — LABORATORY WORKBENCH V2

Purpose:
Fix the installed Laboratory V1 UI that incorrectly shows numbered mockup screens and has unreadable text in dark mode. Keep the underlying real laboratory workflow, data, and APIs intact.

Changes:
- Removes the huge 'Laboratory Module' blue header and numbered screen indicators.
- Replaces demo navigation with practical work queues.
- New case-first overview with search, patient/order/laboratory, independent item counts and outcomes.
- Dentist can access New Lab Prescription at the top without navigating to dispatch.
- PracticeAdmin can add lab partners and assign technicians at the top.
- Clear workflow destinations for each role (dentist, reception, partner technician).
- Scoped high-contrast light cards that work even when the application is in dark mode.
- Preserves clinical QA, physically confirmed custody, redo, fitment, and closure transitions from V1.

Install:
1. Upload 'curvtab-laboratory-workbench-fix-v2.sh' to Codespaces project folder.
2. Run:
   cd /workspaces/CurvTab-Dental-2.0 && bash curvtab-laboratory-workbench-fix-v2.sh
3. Refresh port 5173 or 5174. If Vite isn't running, restart the frontend normally.

Safety:
- Creates a source-file backup under /workspaces/.curvtab-safe-snapshots/ before patching.
- Runs npm run build --prefix frontend.
- Automatically restores old TSX/CSS if the patch or build fails.
- Does not change backend/API, migrations, PostgreSQL records, financials or subscriptions.

Status:
Shell syntax and TypeScript TSX parsing/transpilation verified against the original uploaded Laboratory V1 source. Live Codespace/frontend build was not run here.

Further engineering/testing before partner deployment:
- End-to-end role walkthrough of the 10 logical actions in the guide.
- Correct lab partner provisioning and scoped permissions.
- Integration with original treatment plan, automatic notifications and production QA acceptance test.
- Confirm printed custody manifests and multi-item independent QA/redo case.
