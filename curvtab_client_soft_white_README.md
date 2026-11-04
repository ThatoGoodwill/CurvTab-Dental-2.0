# CurvTab Dental 2.0 — Client soft-white theme

This visual update follows the client-provided reference: white navigation, pale blue/white hero, blue call-to-action buttons, low-contrast cards, readable charts, calm form fields and subtle hover animations.

**Scope:** Only a presentation theme for the existing React app. It does **not** create or fake KPIs or change clinical workflows, checkout, notifications, API, authentication or data. It assumes the prior `CurvTabVisualUpgrade` dashboard component was installed.

## Installation

Upload `curvtab_client_soft_white.py` **and** `curvtab_client_soft_white.css` into the root of your Codespace (`/workspaces/CurvTab-Dental-2.0`). Then:

```bash
cd /workspaces/CurvTab-Dental-2.0
python3 curvtab_client_soft_white.py
cd frontend
npm run build
npm run lint
```

If the build passes, refresh the running Vite site on port 5173 (restart Vite if it is stale).

## Rollback

The installer prints a backup directory. To restore the previous UI, from the repository root:

```bash
cp .curvtab-ui-backups/<your-backup-directory>/App.tsx frontend/src/App.tsx
rm frontend/src/ClientSoftWhiteTheme.css
```

Never remove backend code or databases to undo a frontend theme.

## Verify

- Dashboard looks pale/white across Dentist, Receptionist and PracticeAdmin.
- Charts, calendar hover names, notifications and clinical links still work.
- Sidebar remains white, active nav is blue, My Profile remains last.
- Forms and dropdowns remain accessible; dark mode still works if your app uses the documented dark class/theme attribute.
- Real-world practice metrics must be fetched from your APIs; never treat sample data as actual performance.

If an exact 1:1 recreation is needed, the latest App.tsx and CSS files will be needed to refine component spacing and metric cards.
