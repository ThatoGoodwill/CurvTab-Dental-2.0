#!/usr/bin/env bash
# CurvTab Lab fixes - run from the repo root in Codespaces:  bash apply-lab-fixes.sh
# Safe to run twice. Backs up the controller first. Does NOT touch your database or data.
set -euo pipefail

F="backend/CurvTabDental.API/Controllers/LaboratoryController.cs"
[ -f "$F" ] || { echo "Run this from the repo root (the folder that contains backend/ and frontend/)."; exit 1; }

echo "== 1. Check lab tables exist in the database =="
if docker ps --format '{{.Names}}' | grep -qx curvtab-db; then
  docker exec curvtab-db psql -U curvtab -d curvtabdb -tAc \
    "select count(*) || ' lab tables found (expected 8)' from information_schema.tables where table_name like 'Laboratory%';"
else
  echo "Container curvtab-db is not running - start it with: docker compose up -d db"
fi

echo "== 2. Patch LaboratoryController.cs =="
cp "$F" "$F.before-lab-fixes"
python3 - "$F" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
done = []

# a) Sequential order reference LAB-00124
old = 'Reference = "LAB-" + DateTime.UtcNow.ToString("yyMMdd") + "-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant() };'
new = 'Reference = "LAB-" + ((await _db.Set<LaboratoryOrder>().CountAsync(ct)) + 1).ToString("D5") };'
if old in s: s = s.replace(old, new); done.append("order reference")

# b) Sequential manifest references PL-0627 / PL-OUT-0041
old = 'Reference = (request.Direction == "ToLab" ? "PL-SEND-" : "PL-OUT-") + DateTime.UtcNow.ToString("yyMMdd") + "-" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant() };'
new = ('Reference = (request.Direction == "ToLab" ? "PL-" : "PL-OUT-") +\n'
       '                ((await _db.Set<LaboratoryManifest>().CountAsync(x => x.Direction == request.Direction, ct)) + 1).ToString("D4") };')
if old in s: s = s.replace(old, new); done.append("manifest reference")

# c) Resolve redo cycle when the item physically returns to the practice
old = '            else item.QaStatus = "Pending";\n'
new = ('            else\n            {\n'
       '                item.QaStatus = "Pending";\n'
       '                var openRedos = await _db.Set<LaboratoryCorrection>()\n'
       '                    .Where(c => c.LaboratoryItemId == item.Id && c.Kind == "Redo" && c.Status != "Resolved").ToListAsync(ct);\n'
       '                foreach (var redo in openRedos) { redo.Status = "Resolved"; redo.ResolvedAtUtc = DateTime.UtcNow; }\n'
       '            }\n')
if old in s: s = s.replace(old, new); done.append("redo cycle")

open(p, "w", encoding="utf-8").write(s)
print("Applied:", ", ".join(done) if done else "nothing new (already patched)")
PY

echo "== 3. Build API =="
dotnet build backend/CurvTabDental.slnx -v q --nologo 2>&1 | tail -5

echo "== 4. Build frontend =="
(cd frontend && npm run build 2>&1 | tail -5)

echo
echo "Done. To run the new API code:  docker compose up -d --build api"
echo "If step 1 showed fewer than 8 tables, STOP and send me that line before rebuilding."
