#!/usr/bin/env bash
# Run from the repo root in Codespaces AFTER merging the config-center branch and running git pull.
#   bash scripts/apply-config-center.sh
# Optional: export NEON='postgresql://...' first to also update the live (Neon) database.
set -euo pipefail
[ -d backend ] || { echo "Run from the repo root."; exit 1; }
SQL=scripts/sql/practice-configuration.sql

echo "== 1. Create the settings table in the Codespace database =="
docker start curvtab-db >/dev/null 2>&1 || true; sleep 3
docker exec -i curvtab-db psql -U curvtab -d curvtabdb -v ON_ERROR_STOP=1 < "$SQL"

if [ -n "${NEON:-}" ]; then
  echo "== 2. Create the settings table in the live Neon database =="
  docker run --rm -i postgres:16 psql "$NEON" -v ON_ERROR_STOP=1 < "$SQL"
else
  echo "== 2. Skipped Neon (NEON not set). Live site will show an error on the new screens until you run this with NEON set. =="
fi

echo "== 3. Build API =="
dotnet build backend/CurvTabDental.slnx -v q --nologo 2>&1 | tail -4
echo "== 4. Build frontend =="
(cd frontend && npm run build 2>&1 | tail -4)

echo "== 5. Restart the local API container with the new code =="
docker build -t curvtab-api-repaired:latest . 2>&1 | tail -2
docker inspect curvtab-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/api.env
docker rm -f curvtab-api >/dev/null
docker run -d --name curvtab-api --restart unless-stopped --network curvtab-dental-20_default --network-alias api \
  -p 3001:8080 --env-file /tmp/api.env \
  -v "$PWD/clinical-media:/app/clinical-media" -v "$PWD/practice-media:/app/practice-media" \
  curvtab-api-repaired:latest >/dev/null
sleep 8
docker ps --format '{{.Names}}  {{.Status}}'
echo "Done. Push to GitHub so Render rebuilds the live API (Render redeploys on push)."
