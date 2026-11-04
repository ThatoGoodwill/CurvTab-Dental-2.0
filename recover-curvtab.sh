#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/workspaces/CurvTab-Dental-2.0"
DB_VOLUME="694f626bcbd03aed20f97e8e0fa4b37660b77cf92b57778f539fe329ba56617a"
BACKUP="$ROOT/.curvtab-clinical-backups/postgres-volume-recovery.tar.gz"
OVERRIDE="$ROOT/docker-compose.recovery.yml"

trap 'echo ""; echo "RECOVERY STOPPED at line $LINENO. Read the error above. Database volumes have NOT been deleted."' ERR

cd "$ROOT"

echo "======================================"
echo " CURVTAB DENTAL RECOVERY"
echo "======================================"

echo ""
echo "STEP 1: Verifying database backup..."

test -s "$BACKUP"
tar -tzf "$BACKUP" >/dev/null

docker volume inspect "$DB_VOLUME" >/dev/null

CURRENT_VOLUME="$(
  docker inspect curvtab-db \
    --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}'
)"

if [ "$CURRENT_VOLUME" != "$DB_VOLUME" ]; then
  echo "ERROR: Database volume does not match."
  echo "Expected: $DB_VOLUME"
  echo "Found: $CURRENT_VOLUME"
  exit 1
fi

echo "Backup verified."
echo "Original PostgreSQL volume identified."

echo ""
echo "STEP 2: Preparing safe Compose recovery configuration..."

cat > "$OVERRIDE" <<EOF
services:
  db:
    volumes:
      - curvtab_recovered_data:/var/lib/postgresql/data

volumes:
  curvtab_recovered_data:
    external: true
    name: $DB_VOLUME
EOF

docker compose \
  -f docker-compose.yml \
  -f docker-compose.recovery.yml \
  config --quiet

echo "Original database volume will be reused."

echo ""
echo "STEP 3: Removing damaged container metadata..."
echo "Database volume will NOT be removed."

docker rm -f curvtab-api curvtab-db

echo ""
echo "STEP 4: Restarting PostgreSQL with original data..."

docker compose \
  -f docker-compose.yml \
  -f docker-compose.recovery.yml \
  up -d --no-deps db

echo ""
echo "Waiting for PostgreSQL readiness..."

DB_READY=0

for attempt in $(seq 1 30); do
  if docker exec curvtab-db \
    pg_isready -U curvtab -d curvtabdb >/dev/null 2>&1; then
    DB_READY=1
    break
  fi

  sleep 2
done

if [ "$DB_READY" -ne 1 ]; then
  echo "ERROR: PostgreSQL did not start."
  docker logs --tail 80 curvtab-db
  exit 1
fi

echo "PostgreSQL is running."

echo ""
echo "STEP 5: Verifying original dental records..."

docker exec -i curvtab-db \
  psql -U curvtab -d curvtabdb -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'Patients' AS item, COUNT(*) AS total FROM "Patients"
UNION ALL
SELECT 'Invoices', COUNT(*) FROM "Invoice"
UNION ALL
SELECT 'Medical Aid Claims', COUNT(*) FROM "MedicalAidClaims"
UNION ALL
SELECT 'Medical Aid Remittance Advices', COUNT(*)
FROM "MedicalAidRemittanceAdvices";
SQL

echo ""
echo "STEP 6: Creating a fresh database backup..."

NEW_BACKUP="$ROOT/.curvtab-clinical-backups/recovered-$(date +%Y%m%d-%H%M%S).dump"

docker exec curvtab-db \
  pg_dump -U curvtab -d curvtabdb -Fc > "$NEW_BACKUP"

test -s "$NEW_BACKUP"

docker exec -i curvtab-db \
  pg_restore --list < "$NEW_BACKUP" >/dev/null

echo "New database backup verified: $NEW_BACKUP"

echo ""
echo "STEP 7: Reducing Docker build context..."

touch .dockerignore

for pattern in \
  ".git" \
  "**/node_modules" \
  "**/dist" \
  "**/bin" \
  "**/obj" \
  ".curvtab-clinical-backups" \
  "clinical-media" \
  "practice-media"
do
  grep -Fxq "$pattern" .dockerignore || echo "$pattern" >> .dockerignore
done

echo ""
echo "STEP 8: Clearing disposable Docker build cache..."

docker builder prune -f

echo ""
echo "STEP 9: Rebuilding CurvTab API..."

docker compose \
  -f docker-compose.yml \
  -f docker-compose.recovery.yml \
  build --no-cache api

echo ""
echo "STEP 10: Starting CurvTab API..."

docker compose \
  -f docker-compose.yml \
  -f docker-compose.recovery.yml \
  up -d --no-deps --no-build api

API_RUNNING=0

for attempt in $(seq 1 30); do
  HTTP_CODE="$(
    curl -s -o /dev/null -w '%{http_code}' \
      http://localhost:8080/api/finance/medical-aid/claims \
      || true
  )"

  if [ "$HTTP_CODE" = "200" ] ||
     [ "$HTTP_CODE" = "401" ] ||
     [ "$HTTP_CODE" = "403" ]; then
    API_RUNNING=1
    break
  fi

  sleep 2
done

if [ "$API_RUNNING" -ne 1 ]; then
  echo "ERROR: API is not responding."
  docker logs --tail 80 curvtab-api
  exit 1
fi

echo "CurvTab API is responding (HTTP $HTTP_CODE)."

echo ""
echo "STEP 11: Starting React frontend..."

cd "$ROOT/frontend"

if ! curl -fsS http://localhost:5173/ >/dev/null 2>&1; then
  nohup npm run dev -- --host 0.0.0.0 \
    > /tmp/curvtab-vite.log 2>&1 < /dev/null &
fi

FRONTEND_READY=0

for attempt in $(seq 1 30); do
  if curl -fsS http://localhost:5173/ >/dev/null 2>&1; then
    FRONTEND_READY=1
    break
  fi

  sleep 2
done

if [ "$FRONTEND_READY" -ne 1 ]; then
  echo "ERROR: Frontend did not start."
  tail -50 /tmp/curvtab-vite.log
  exit 1
fi

echo ""
echo "======================================"
echo " CURVTAB DENTAL RECOVERY COMPLETE"
echo "======================================"

echo ""
echo "PostgreSQL: RUNNING"
echo "API:        RUNNING"
echo "Frontend:   RUNNING"
echo ""
echo "Frontend: http://localhost:5173"
echo "API:      http://localhost:8080"
echo ""
echo "Original database volume preserved."
echo "Database backup verified."
echo ""

docker ps --filter name=curvtab

