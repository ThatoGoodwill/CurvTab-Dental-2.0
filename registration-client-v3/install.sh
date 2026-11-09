#!/usr/bin/env bash
# CurvTab Dental — registration UX V3, six client-approved stages.
# Safe prechange backup and additive schema validation; no database reset.
set -Eeuo pipefail
umask 077
ROOT='/workspaces/CurvTab-Dental-2.0'
cd "$ROOT"
HERE="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
SAFE="/workspaces/.curvtab-safe-snapshots/registration-client-v3-$STAMP"
mkdir -p "$SAFE"
chmod 700 "$SAFE"

printf '\n===== CURVTAB REGISTRATION — CLIENT V3 =====\n'
[ -f frontend/src/pages/PatientsPage.tsx ] || { echo 'STOP: frontend source missing'; exit 1; }
[ -f frontend/src/pages/RegistrationExtras.tsx ] || { echo 'STOP: registration V2 not installed'; exit 1; }
if grep -q 'CT_REGISTRATION_CLIENT_V3' frontend/src/pages/PatientsPage.tsx; then
 echo 'Already installed. Nothing was overwritten.'; exit 0
fi
if ! docker exec curvtab-db pg_isready -U curvtab -d curvtabdb >/dev/null 2>&1; then
 echo 'STOP: database must be healthy before installer changes source'; exit 1
fi
if ! docker exec curvtab-db psql -U curvtab -d curvtabdb -Atc 'SELECT "MigrationId" FROM "__EFMigrationsHistory"' | grep -q 'RecoveryRegistrationCompleteV2'; then
 echo 'STOP: Registration V2 migration is missing. No source changed.'; exit 1
fi

printf '\n===== 1/7 VERIFIED PROJECT AND DATABASE BACKUPS =====\n'
docker exec curvtab-db pg_dump -U curvtab -d curvtabdb -Fc > "$SAFE/curvtabdb.dump"
test -s "$SAFE/curvtabdb.dump"
docker exec -i curvtab-db pg_restore -l < "$SAFE/curvtabdb.dump" >/dev/null
tar -czf "$SAFE/project-source-before-v3.tar.gz" --exclude='*/node_modules' --exclude='*/bin' --exclude='*/obj' --exclude='*/dist' -C /workspaces CurvTab-Dental-2.0
tar -tzf "$SAFE/project-source-before-v3.tar.gz" >/dev/null
git status --short > "$SAFE/git-status-before.txt"
printf 'Backup created: %s\n' "$SAFE"

printf '\n===== 2/7 PATCH CURRENT REGISTRATION ONLY =====\n'
python3 "$HERE/patch.py" "$ROOT"

printf '\n===== 3/7 BUILD REACT =====\n'
if [ ! -d frontend/node_modules ]; then (cd frontend && npm ci); fi
(cd frontend && npm run build)

printf '\n===== 4/7 BUILD .NET API =====\n'
dotnet restore backend/CurvTabDental.API/CurvTabDental.API.csproj
dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj --no-restore

printf '\n===== 5/7 GENERATE AND INSPECT ADDITIVE EF MIGRATION =====\n'
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
"$EF" migrations add RegistrationClientCompactV3 \
 --project backend/CurvTabDental.Infrastructure/CurvTabDental.Infrastructure.csproj \
 --startup-project backend/CurvTabDental.API/CurvTabDental.API.csproj \
 --context DentalDbContext --output-dir Persistence/Migrations
python3 - <<'PY'
from pathlib import Path
import re,sys
folder=Path('backend/CurvTabDental.Infrastructure/Persistence/Migrations')
files=list(folder.glob('*_RegistrationClientCompactV3.cs'))
if len(files)!=1:sys.exit('STOP: Unexpected EF migration file(s). No migration applied.')
s=files[0].read_text()
a=s.find('protected override void Up(');b=s.find('protected override void Down(')
if a<0 or b<a:sys.exit('STOP: Cannot inspect migration Up()')
up=s[a:b]
ops=re.findall(r'migrationBuilder\.(\w+)\s*\(',up)
if ops!=['AddColumn','AddColumn'] or 'ProfileJson' not in up or 'GuardianConsent' not in up or 'PatientRegistrationDetails' not in up:
 sys.exit(f'STOP: Migration differs from expected single nullable column: {ops}. Not applied.')
if up.count('nullable: true') < 2:sys.exit('STOP: Both new columns must be nullable. Not applied.')
print('Verified migration: two nullable administrative columns only.')
PY

printf '\n===== 6/7 APPLY ADDITIVE COLUMN =====\n'
"$EF" database update \
 --project backend/CurvTabDental.Infrastructure/CurvTabDental.Infrastructure.csproj \
 --startup-project backend/CurvTabDental.API/CurvTabDental.API.csproj \
 --context DentalDbContext

docker exec curvtab-db psql -U curvtab -d curvtabdb -v ON_ERROR_STOP=1 -Atc \
 "SELECT column_name FROM information_schema.columns WHERE table_name='PatientRegistrationDetails' AND column_name IN ('ProfileJson','GuardianConsent') ORDER BY column_name;" \
 | grep -q 'ProfileJson' || { echo 'STOP: Expected column not found'; exit 1; }

printf '\n===== 7/7 REBUILD API WITHOUT ALTERING POSTGRES VOLUME =====\n'
VOLUME="$(docker inspect curvtab-db --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"
if [ -z "$VOLUME" ]; then echo 'STOP: Docker volume could not be identified. Nothing deleted.';exit 1; fi
TMP="$(mktemp /tmp/curvtab-v3-compose.XXXXXX.yml)"
trap 'rm -f "$TMP"' EXIT
printf 'volumes:\n  curvtab-recovered-data:\n    external: true\n    name: %s\n' "$VOLUME" > "$TMP"
docker compose -f docker-compose.yml -f "$TMP" up -d --build api
for n in $(seq 1 25); do
 CODE="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/health || true)"
 if [ "$CODE" = '200' ]; then
  echo '============================================='
  echo ' REGISTRATION CLIENT V3 INSTALLED — API 200'
  echo ' Six compact stages + conditional guardian signature'
  echo ' Project and DB backups:'
  echo " $SAFE"
  echo '============================================='
  exit 0
 fi
 sleep 2
done
echo 'API health not confirmed. Inspect: docker logs --tail 100 curvtab-api'
echo "Current backup: $SAFE"
exit 1
