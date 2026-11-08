#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT="/workspaces/CurvTab-Dental-2.0"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
STORE="/workspaces/.curvtab-safe-snapshots"
SAFE="$STORE/rebuild-$STAMP"
mkdir -p "$SAFE"; chmod 700 "$STORE" "$SAFE"
cd "$ROOT"
SELF="$(readlink -f "$0")"
echo "===== CURVTAB CLINICAL RECOVERY V1 ====="
echo "Existing subscriptions, patients and staff are not reset."

# Refuse unexpected projects. This installer was written against the user's uploaded source.
for file in frontend/src/pages/DentalChartingPage.tsx backend/CurvTabDental.Infrastructure/Persistence/DentalDbContext.cs backend/CurvTabDental.API/Controllers/ConsultationsController.cs; do
  test -f "$file" || { echo "STOP: Missing expected project file: $file"; exit 1; }
done
if grep -q 'CT_RECOVERED_TREATMENT_PLANS_V1' backend/CurvTabDental.Infrastructure/Persistence/DentalDbContext.cs; then
  echo "Already patched. No duplicate installation performed."; exit 0
fi

if ! docker exec curvtab-db pg_isready -U curvtab -d curvtabdb >/dev/null 2>&1; then
  echo "STOP: PostgreSQL is not ready."; exit 1
fi

LAST="$(docker exec curvtab-db psql -U curvtab -d curvtabdb -Atc 'SELECT "MigrationId" FROM "__EFMigrationsHistory" ORDER BY "MigrationId" DESC LIMIT 1')"
if [[ "$LAST" != '20261106100938_AddSubscriptionEnforcementOptIn' ]]; then
  echo "STOP: Expected subscription migration as latest: found $LAST"
  echo "No application files changed."
  exit 1
fi

SUB="$(docker exec curvtab-db psql -U curvtab -d curvtabdb -Atc "SELECT to_regclass('public.\"PracticeSubscriptions\"');")"
[[ -n "$SUB" ]] || { echo 'STOP: Subscription tables not confirmed.'; exit 1; }

if [ -f frontend/src/pages/RecoveredClinicalWorkspace.tsx ] || [ -f backend/CurvTabDental.Domain/Entities/PatientTreatmentPlan.cs ]; then
 echo 'STOP: Recovery files already exist. Manual comparison needed.'; exit 1
fi

echo '===== STEP 1 / 7: COMPLETE PRECHANGE BACKUPS ====='
docker exec curvtab-db pg_dump -U curvtab -d curvtabdb -Fc > "$SAFE/curvtabdb-before-rebuild.dump"
test -s "$SAFE/curvtabdb-before-rebuild.dump"
docker exec -i curvtab-db pg_restore -l < "$SAFE/curvtabdb-before-rebuild.dump" >/dev/null
# Save all source, hidden config, git, local backup files. Exclude regenerated dependencies.
tar -czf "$SAFE/project-before-rebuild.tar.gz" \
 --exclude='*/node_modules' --exclude='*/obj' --exclude='*/bin' --exclude='*/dist' \
 -C /workspaces CurvTab-Dental-2.0
tar -tzf "$SAFE/project-before-rebuild.tar.gz" >/dev/null
git status --short > "$SAFE/git-status-before.txt"
git bundle create "$SAFE/git-history.bundle" --all >/dev/null
# Read-only Docker metadata (not logs with patient data).
docker ps -a > "$SAFE/docker-containers.txt"
docker volume ls > "$SAFE/docker-volumes.txt"
echo "Backups verified: $SAFE"

WORK="$(mktemp -d /tmp/curvtab-installer.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

# The sole file downloaded by the user embeds the source payload after the marker.
python3 - "$SELF" "$WORK" <<'PY'
from pathlib import Path
import base64,io,sys,zipfile
source=Path(sys.argv[1]).read_bytes()
marker=b'\n__CURVTAB_RECOVERY_PAYLOAD__\n'
if source.count(marker)!=1: raise SystemExit('STOP: invalid recovery installer payload')
data=base64.b64decode(source.split(marker,1)[1].strip(),validate=True)
with zipfile.ZipFile(io.BytesIO(data)) as z:
    for item in z.infolist():
        p=Path(item.filename)
        if p.is_absolute() or '..' in p.parts: raise SystemExit('STOP: unsafe package entry')
        z.extract(item,sys.argv[2])
PY

echo '===== STEP 2 / 7: PATCH SOURCE ====='
python3 "$WORK/patch.py" "$ROOT" "$WORK/overlay"

echo '===== STEP 3 / 7: RESTORE AND BUILD API ====='
if ! dotnet restore backend/CurvTabDental.API/CurvTabDental.API.csproj || \
   ! dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj --no-restore; then
  echo "STOP: Backend build failed. Prechange backup: $SAFE"
  exit 1
fi

echo '===== STEP 4 / 7: BUILD FRONTEND ====='
if [ ! -d frontend/node_modules ]; then
  (cd frontend && npm ci)
fi
if ! (cd frontend && npm run build); then
 echo "STOP: Frontend build failed. Prechange backup: $SAFE"
 exit 1
fi

echo '===== STEP 5 / 7: GENERATE EF CORE MIGRATION ====='
EF=/tmp/curvtab-ef/dotnet-ef
if [ ! -x "$EF" ]; then
  mkdir -p /tmp/curvtab-ef
  dotnet tool install dotnet-ef --tool-path /tmp/curvtab-ef --version '10.*'
fi
export ASPNETCORE_ENVIRONMENT=Development
export ConnectionStrings__DentalDatabase="Host=localhost;Port=5432;Database=curvtabdb;Username=curvtab;Password=curvtab123"

"$EF" migrations add RecoveryTreatmentPlansV1 \
  --project backend/CurvTabDental.Infrastructure/CurvTabDental.Infrastructure.csproj \
  --startup-project backend/CurvTabDental.API/CurvTabDental.API.csproj \
  --context DentalDbContext \
  --output-dir Persistence/Migrations

# EF must generate precisely the two newly added clinical tables. Reject anything else.
python3 - <<'PY'
from pathlib import Path
import re,sys
folder=Path('backend/CurvTabDental.Infrastructure/Persistence/Migrations')
files=list(folder.glob('*_RecoveryTreatmentPlansV1.cs'))
if len(files)!=1: sys.exit('STOP: expected exactly one new migration file')
s=files[0].read_text()
a=s.find('protected override void Up('); b=s.find('protected override void Down(')
if a<0 or b<0: sys.exit('STOP: unrecognised migration')
up=s[a:b]
ops=re.findall(r'migrationBuilder\.(\w+)\s*\(',up)
if ops.count('CreateTable')!=2 or any(x not in ('CreateTable','CreateIndex') for x in ops):
    sys.exit(f'STOP: migration has unexpected operations: {ops}')
for table in ('PatientTreatmentPlans','PatientTreatmentProcedures'):
    if f'name: "{table}"' not in up: sys.exit(f'STOP: expected table {table} not found')
print('SAFE MIGRATION CHECK:',ops)
PY

echo '===== STEP 6 / 7: APPLY TWO ADDITIVE TABLES ====='
"$EF" database update \
 --project backend/CurvTabDental.Infrastructure/CurvTabDental.Infrastructure.csproj \
 --startup-project backend/CurvTabDental.API/CurvTabDental.API.csproj \
 --context DentalDbContext

docker exec curvtab-db psql -U curvtab -d curvtabdb -v ON_ERROR_STOP=1 -c \
 "SELECT to_regclass('public.\"PatientTreatmentPlans\"'), to_regclass('public.\"PatientTreatmentProcedures\"');"

echo '===== STEP 7 / 7: REBUILD RUNNING API ====='
# Preserve actual existing db Docker volume (never create a new empty database).
VOLUME="$(docker inspect curvtab-db --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"
if [[ -z "$VOLUME" ]]; then
  echo "API rebuild skipped: cannot verify database volume mount."
  echo "Code and migration installed, DB intact; check docker inspect curvtab-db."
  exit 0
fi
cat > "$WORK/volume-override.yml" <<EOF
volumes:
  curvtab-recovered-data:
    external: true
    name: $VOLUME
EOF
if ! docker compose -f docker-compose.yml -f "$WORK/volume-override.yml" up -d --build api; then
 echo 'STOP: API image rebuild failed. Backups are preserved.'; exit 1
fi
for i in $(seq 1 20); do
 STATUS="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/health || true)"
 if [[ "$STATUS" == '200' ]]; then
   echo '=========================================='
   echo 'RECOVERY INSTALLATION COMPLETE'
   echo 'API: 200; frontend source built successfully'
   echo "Prechange backup: $SAFE"
   echo 'Open your running frontend, log in as Dentist, and select Dental Charting.'
   echo '=========================================='
   exit 0
 fi
 sleep 2
done
echo 'STOP: API not healthy yet. Check docker logs --tail 70 curvtab-api.'
exit 1

__CURVTAB_RECOVERY_PAYLOAD__
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a/tV4cEX8e1+OO5d86yyMvfJmzfEN8Lc0zoW7vreyFblbgn6QmJOlTK9OqrH+kKWIb/QdKzqhEpGLzgdA4/KLkP0xrVfy3yo73Qq/7HqkMZBMBqvx6JxGIrGYSQa+4F4IlQ5xwfhnGa+QJt2Wyi6aJxrnQryDMtoZbbXRC8zNNytF9Zm2DYVJNFqJ/mwx0XEclQKTipQq/g5WvmBKUzVBLUKBOu2k9RqOiFbfYISq9XEOLTLt70A7ytxmNi/kQOa1zP9CMO+vwOUvVG09UqpsK789fut0uuL73cdt/51TTZ70Q4ZrmJ+Vpy8Jk30wlE3HHqhEvqKtgo/s7HNnkxsK7jebs3etSsorSau7GZLVuyvdDlVrMl//o1f0oANJVdEWmfhh3k6ViBf7ASuWs1sF8TxFhJCbocIa8Fb8ncj4T6tcJNJKt1HvuULDRq5quRcBdDkOX7/z032tUzbiTmcNDymMqm7iBmekCXr9l7/bGGPTMW07QgmTCRYSazVbkXlcoJhx2wuCNEEtyNspmFueWiSfQm9tVG/peaU8/YKLcOB6AaLntU4LL1nh/fAIFq6ikKtZmFTO9gePKR0ET47WQ6KuDlYW7yjfXLna3lbg49X0YRVqqjKcNCjXC8v4pTnc/wWbXuvlPADbaut7FDAl0MJX+ptbBm178ggzaVp4IxjMGhik1PwJaETPPvlzVM8g/hZ4QFUytylYXIQkyH2JonEbpJ3EGHN5KNyoEyQ4tIulFOejn3vB6+4hjPXa6kuCEOmRobbD65MOcZRKAdLJYGj4S8QFXTl+0infoHs5rkER7WovNazJKUUsxPCArNf+cH2XJQ79tpvvMTk84NoK2a7WD1KxZ3YZ+ECXdyKWYHVwbJihjXl1C2fMZzQ4jrRKdrANpnzZOvjK3vDZ8Wsva3FYUaN58P5c8Kk715UNJQ5NCzQKH22bzsc7vLP2XbE2srN37XJhoqFtWJn8PC53+mS3vWw85F0Hu56n7rDLir2X1BLAQIUAxQAAAAIADFaaF19M5JNaAcAAJIfAABQAAAAAAAAAAAAAACkgQAAAABvdmVybGF5L2JhY2tlbmQvQ3VydlRhYkRlbnRhbC5BUEkvQ29udHJvbGxlcnMvUGF0aWVudFRyZWF0bWVudFBsYW5zQ29udHJvbGxlci5jc1BLAQIUAxQAAAAIADFaaF3J+nbdoQEAALoFAABFAAAAAAAAAAAAAACkgdYHAABvdmVybGF5L2JhY2tlbmQvQ3VydlRhYkRlbnRhbC5Eb21haW4vRW50aXRpZXMvUGF0aWVudFRyZWF0bWVudFBsYW4uY3NQSwECFAMUAAAACABgWmhdyCh01LkMAAAeKwAAOQAAAAAAAAAAAAAApIHaCQAAb3ZlcmxheS9mcm9udGVuZC9zcmMvcGFnZXMvUmVjb3ZlcmVkQ2xpbmljYWxXb3Jrc3BhY2UudHN4UEsBAhQDFAAAAAgAYFpoXca9x8QWBAAAPAwAADkAAAAAAAAAAAAAAKSB6hYAAG92ZXJsYXkvZnJvbnRlbmQvc3JjL3BhZ2VzL1JlY292ZXJlZENsaW5pY2FsV29ya3NwYWNlLmNzc1BLAQIUAxQAAAAIAHlaaF1Oua8jGQcAAOsVAAAIAAAAAAAAAAAAAACkgVcbAABwYXRjaC5weVBLBQYAAAAABQAFAPUBAACWIgAAAAA=
