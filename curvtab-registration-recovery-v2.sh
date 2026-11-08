#!/usr/bin/env bash
# CurvTab Dental — comprehensive registration recovery v2
# Created against the user's supplied source and the successful clinical recovery v1.
set -Eeuo pipefail
umask 077
ROOT='/workspaces/CurvTab-Dental-2.0'
STORE='/workspaces/.curvtab-safe-snapshots'
STAMP="$(date -u +%Y%m%d-%H%M%S)"
SAFE="$STORE/registration-$STAMP"
mkdir -p "$SAFE"
chmod 700 "$STORE" "$SAFE"
cd "$ROOT"
SELF="$(readlink -f "$0")"
echo '===== CURVTAB COMPLETE PATIENT REGISTRATION V2 ====='
echo 'This will not modify the dental chart or subscriptions.'
for p in frontend/src/pages/PatientsPage.tsx backend/CurvTabDental.API/Controllers/PatientsController.cs backend/CurvTabDental.API/Contracts/Contracts.cs backend/CurvTabDental.Infrastructure/Persistence/DentalDbContext.cs; do
 test -f "$p" || { echo "STOP: missing $p"; exit 1; }
done
if grep -q CT_REGISTRATION_COMPLETE_V2 backend/CurvTabDental.Infrastructure/Persistence/DentalDbContext.cs; then
 echo 'Already installed (source marker found). No changes made.'
 exit 0
fi
if [ -e frontend/src/pages/RegistrationExtras.tsx ] || [ -e backend/CurvTabDental.Domain/Entities/PatientRegistrationDetails.cs ]; then
 echo 'STOP: partial registration files already exist. Preserve and review them first.'
 exit 1
fi
if ! grep -q 'CT_REGISTRATION_WIZARD_V3' frontend/src/pages/PatientsPage.tsx; then
 echo 'STOP: registration page differs from the inspected source. No files changed.'; exit 1
fi
if ! grep -q 'CT_RECOVERED_TREATMENT_PLANS_V1' backend/CurvTabDental.Infrastructure/Persistence/DentalDbContext.cs; then
 echo 'STOP: prior clinical installer v1 not detected. No files changed.'; exit 1
fi
if ! docker exec curvtab-db pg_isready -U curvtab -d curvtabdb >/dev/null 2>&1; then
 echo 'STOP: Database unavailable. No source modified.'; exit 1
fi
if ! docker exec curvtab-db psql -U curvtab -d curvtabdb -Atc \
 'SELECT "MigrationId" FROM "__EFMigrationsHistory"' | grep -q 'RecoveryTreatmentPlansV1'; then
 echo 'STOP: clinical v1 DB migration not present. No source modified.'; exit 1
fi
printf '\n===== 1/8 VERIFIED PRECHANGE BACKUP =====\n'
docker exec curvtab-db pg_dump -U curvtab -d curvtabdb -Fc > "$SAFE/curvtabdb-before-registration.dump"
test -s "$SAFE/curvtabdb-before-registration.dump"
docker exec -i curvtab-db pg_restore -l < "$SAFE/curvtabdb-before-registration.dump" >/dev/null
tar -czf "$SAFE/source-before-registration.tar.gz" \
 --exclude='*/node_modules' --exclude='*/obj' --exclude='*/bin' --exclude='*/dist' \
 -C /workspaces CurvTab-Dental-2.0
tar -tzf "$SAFE/source-before-registration.tar.gz" >/dev/null
git status --short > "$SAFE/git-status.txt"
echo "Verified backups: $SAFE"

TMP="$(mktemp -d /tmp/curvtab-registration.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
python3 - "$SELF" "$TMP" <<'PY'
from pathlib import Path
import sys,io,zipfile,base64
raw=Path(sys.argv[1]).read_bytes()
marker=b'\n__CURVTAB_REGISTRATION_PAYLOAD__\n'
if raw.count(marker)!=1: raise SystemExit('STOP: installer payload missing or corrupt')
zipdata=base64.b64decode(raw.split(marker,1)[1].strip(),validate=True)
with zipfile.ZipFile(io.BytesIO(zipdata)) as z:
  for i in z.infolist():
    p=Path(i.filename)
    if p.is_absolute() or '..' in p.parts: raise SystemExit('STOP: unsafe archive path')
    z.extract(i,sys.argv[2])
PY
printf '\n===== 2/8 SOURCE PATCH =====\n'
python3 "$TMP/patch.py" "$ROOT" "$TMP"

printf '\n===== 3/8 RESTORE AND COMPILE BACKEND =====\n'
dotnet restore backend/CurvTabDental.API/CurvTabDental.API.csproj
dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj --no-restore

printf '\n===== 4/8 COMPILE FRONTEND =====\n'
if [ ! -d frontend/node_modules ]; then (cd frontend && npm ci); fi
(cd frontend && npm run build)

printf '\n===== 5/8 GENERATE ADDITIVE EF MIGRATION =====\n'
EF='/tmp/curvtab-ef/dotnet-ef'
if [ ! -x "$EF" ]; then
 mkdir -p /tmp/curvtab-ef
 dotnet tool install dotnet-ef --tool-path /tmp/curvtab-ef --version '10.*'
fi
DB_USER="$(docker exec curvtab-db printenv POSTGRES_USER)"
DB_PASS="$(docker exec curvtab-db printenv POSTGRES_PASSWORD)"
DB_NAME="$(docker exec curvtab-db printenv POSTGRES_DB)"
export ASPNETCORE_ENVIRONMENT=Development
export ConnectionStrings__DentalDatabase="Host=localhost;Port=5432;Database=$DB_NAME;Username=$DB_USER;Password=$DB_PASS"
"$EF" migrations add RecoveryRegistrationCompleteV2 \
 --project backend/CurvTabDental.Infrastructure/CurvTabDental.Infrastructure.csproj \
 --startup-project backend/CurvTabDental.API/CurvTabDental.API.csproj \
 --context DentalDbContext --output-dir Persistence/Migrations

printf '\n===== 6/8 VERIFY MIGRATION OPERATIONS =====\n'
python3 - <<'PY'
from pathlib import Path
import re,sys
p=list(Path('backend/CurvTabDental.Infrastructure/Persistence/Migrations').glob('*_RecoveryRegistrationCompleteV2.cs'))
if len(p)!=1: sys.exit('STOP: expected one new migration file')
s=p[0].read_text();a=s.find('protected override void Up(');b=s.find('protected override void Down(')
if a<0 or b<0 or a>b: sys.exit('STOP: migration cannot be inspected')
up=s[a:b]
ops=re.findall(r'migrationBuilder\.(\w+)\s*\(',up)
if ops.count('CreateTable')!=1 or any(x not in {'CreateTable','CreateIndex'} for x in ops):
 sys.exit(f'STOP: Unexpected migration operations: {ops}. Backup is preserved.')
if 'PatientRegistrationDetails' not in up: sys.exit('STOP: unexpected table created')
print('SAFE ADDITIVE MIGRATION:',ops)
PY

printf '\n===== 7/8 APPLY REGISTRATION TABLE =====\n'
"$EF" database update \
 --project backend/CurvTabDental.Infrastructure/CurvTabDental.Infrastructure.csproj \
 --startup-project backend/CurvTabDental.API/CurvTabDental.API.csproj \
 --context DentalDbContext

docker exec curvtab-db psql -U curvtab -d curvtabdb -v ON_ERROR_STOP=1 -c \
 "SELECT to_regclass('public.\"PatientRegistrationDetails\"') AS registration_details, to_regclass('public.\"PatientMedicalHistories\"') AS medical_history;"

printf '\n===== 8/8 REBUILD RUNNING API USING EXISTING DB VOLUME =====\n'
VOLUME="$(docker inspect curvtab-db --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"
if [[ -z "$VOLUME" ]]; then
 echo 'STOP: Cannot determine existing PostgreSQL Docker volume. API not restarted.';exit 1
fi
cat > "$TMP/volume-override.yml" <<EOF
volumes:
  curvtab-recovered-data:
    external: true
    name: $VOLUME
EOF
docker compose -f docker-compose.yml -f "$TMP/volume-override.yml" up -d --build api
for i in $(seq 1 25); do
 CODE="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/health || true)"
 if [ "$CODE" = '200' ]; then
   echo '============================================='
   echo ' REGISTRATION RECOVERY V2 INSTALLATION COMPLETE'
   echo ' API HEALTH 200 — BACKEND AND FRONTEND BUILT'
   echo '============================================='
   echo "Prechange backup: $SAFE"
   echo 'Open Patient Management > Register Patient and inspect all seven steps.'
   exit 0
 fi
 sleep 2
done
echo 'STOP: API health not confirmed. Inspect docker logs --tail 80 curvtab-api.'
echo "Prechange backup: $SAFE"
exit 1

__CURVTAB_REGISTRATION_PAYLOAD__
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
