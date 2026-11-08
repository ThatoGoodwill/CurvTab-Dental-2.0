#!/usr/bin/env bash
# CurvTab Laboratory Workbench V3 — no database migrations, data imports, or samples.
set -Eeuo pipefail
umask 077
ROOT="/workspaces/CurvTab-Dental-2.0"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$ROOT/frontend/src/pages"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP="/workspaces/.curvtab-safe-snapshots/laboratory-before-v3-$STAMP"
for f in LaboratoryModule.tsx LaboratoryModule.css; do
  test -s "$SOURCE_DIR/$f" || { echo "STOP: Installer file missing: $f" >&2; exit 1; }
  test -s "$TARGET/$f" || { echo "STOP: Existing Lab module missing: $TARGET/$f" >&2; exit 1; }
done
if ! grep -q 'CT_LAB_WORKBENCH_V2\|CT_LAB_EXCHANGE_V1' "$TARGET/LaboratoryModule.tsx"; then
  echo 'STOP: Current lab source differs from expected V1/V2; no changes made.' >&2
  exit 1
fi
if grep -q 'CT_LAB_WORKBENCH_V3' "$TARGET/LaboratoryModule.tsx"; then
  echo 'Lab Workbench V3 is already installed. No changes required.'
  exit 0
fi
command -v npm >/dev/null || { echo 'STOP: npm is required.' >&2; exit 1; }
test -f "$ROOT/frontend/package.json" || { echo 'STOP: frontend/package.json missing.' >&2; exit 1; }
mkdir -p "$BACKUP"
cp -p "$TARGET/LaboratoryModule.tsx" "$BACKUP/LaboratoryModule.tsx"
cp -p "$TARGET/LaboratoryModule.css" "$BACKUP/LaboratoryModule.css"
git -C "$ROOT" status --short > "$BACKUP/git-status.txt" || true
printf '%s\n' "Exact Lab UI sources before V3. No database changes." > "$BACKUP/README.txt"
rollback() {
  cp -p "$BACKUP/LaboratoryModule.tsx" "$TARGET/LaboratoryModule.tsx"
  cp -p "$BACKUP/LaboratoryModule.css" "$TARGET/LaboratoryModule.css"
  echo "INSTALLATION FAILED: original Lab files restored from $BACKUP" >&2
}
trap rollback ERR
printf '\n===== CurvTab Laboratory — Workbench V3 =====\n'
echo "Backup: $BACKUP"
cp "$SOURCE_DIR/LaboratoryModule.tsx" "$TARGET/LaboratoryModule.tsx"
cp "$SOURCE_DIR/LaboratoryModule.css" "$TARGET/LaboratoryModule.css"
echo 'Building existing React frontend (no backend/database changes)...'
(cd "$ROOT/frontend" && npm run build)
trap - ERR
printf '\n===== LABORATORY V3 INSTALLED =====\n'
echo 'Frontend build succeeded.'
echo 'No patient records, database schema, subscription or finances changed.'
echo 'Open your Codespaces port 5173 or 5174 and refresh Laboratory.'
echo 'First real workflow: PracticeAdmin adds a laboratory -> Dentist creates prescription.'
echo "Rollback files: $BACKUP"
