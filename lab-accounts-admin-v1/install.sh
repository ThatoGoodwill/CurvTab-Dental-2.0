#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT=/workspaces/CurvTab-Dental-2.0
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
F="$ROOT/frontend/src/pages"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
SAVE="/workspaces/.curvtab-safe-snapshots/lab-accounts-before-$STAMP"
cd "$ROOT"
for file in "$F/StaffPage.tsx" "$F/LaboratoryModule.tsx" "$HERE/patch.py" "$HERE/LaboratoryAccountsPanel.tsx" "$HERE/LaboratoryAccountsPanel.css"; do
  test -s "$file" || { echo "STOP: Required file missing: $file"; exit 1; }
done
if ! grep -q 'CT_LAB_WORKBENCH_V3' "$F/LaboratoryModule.tsx"; then
  echo 'STOP: Expected Laboratory Workbench V3; current source differs. No files changed.'; exit 1
fi
if grep -q 'LaboratoryAccountsPanel' "$F/StaffPage.tsx"; then
  echo 'Already installed; no changes made.'; exit 0
fi
mkdir -p "$SAVE"
cp -p "$F/StaffPage.tsx" "$SAVE/StaffPage.tsx"
git status --short > "$SAVE/git-status.txt"
# A private backup of the currently working system and database is required.
if ! find /workspaces/.curvtab-safe-snapshots /workspaces/.curvtab-private-backups -type f \( -name '*.dump' -o -name 'postgresql-before-lab.dump' \) -size +0c -print -quit 2>/dev/null | grep -q .; then
  echo 'STOP: Existing private database backup not found. Run the full-backup command first.'; exit 1
fi
rollback() {
  cp -p "$SAVE/StaffPage.tsx" "$F/StaffPage.tsx"
  rm -f "$F/LaboratoryAccountsPanel.tsx" "$F/LaboratoryAccountsPanel.css"
  echo "BUILD FAILED. Restored original staff page. Backup: $SAVE" >&2
}
trap rollback ERR
cp "$HERE/LaboratoryAccountsPanel.tsx" "$F/LaboratoryAccountsPanel.tsx"
cp "$HERE/LaboratoryAccountsPanel.css" "$F/LaboratoryAccountsPanel.css"
python3 "$HERE/patch.py" "$ROOT"
(cd "$ROOT/frontend" && npm run build)
trap - ERR
echo 'SUCCESS: PracticeAdmin can add LabTechnician accounts, register partners, and assign technician to a laboratory.'
echo 'No database migrations, patient changes or API code changes.'
echo "Source backup: $SAVE"
