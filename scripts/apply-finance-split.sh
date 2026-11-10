#!/usr/bin/env bash
# Builds the finance/billing split + split-tender checkout. No DB changes needed.
set -e
cd "$(git rev-parse --show-toplevel)"
echo "== Frontend build =="; (cd frontend && npm run build)
echo "== Backend build =="; dotnet build backend/CurvTabDental.API -c Release --nologo -v q
echo "== DONE. Rebuild/replace the API container, then test checkout. =="
