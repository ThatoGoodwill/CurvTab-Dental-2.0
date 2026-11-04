#!/usr/bin/env bash
set -euo pipefail
cd /workspaces/CurvTab-Dental-2.0
printf '\n=== BACKEND BUILD ===\n'
dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj --nologo
printf '\n=== FRONTEND BUILD ===\n'
(cd frontend && npm run build)
printf '\n=== REQUIRED CODE MARKERS ===\n'
for item in \
  'backend/CurvTabDental.API/Controllers/MedicalAidInvoiceSettlementController.cs:CT_PHASE7E3_IDEMPOTENCY_LOCK' \
  'backend/CurvTabDental.API/Controllers/MedicalAidInvoiceSettlementController.cs:CT_PHASE7E3_CLAIM_APPROVAL_CAP' \
  'backend/CurvTabDental.API/Controllers/MedicalAidInvoiceSettlementController.cs:CT_PHASE7E3_ALLOCATIONS_READ' \
  'backend/CurvTabDental.API/Controllers/MedicalAidClaimWorkflowController.cs:CT_PHASE7E3_APPROVAL_CHANGE_GUARD' \
  'backend/CurvTabDental.API/Controllers/FinancialCorrectionsController.cs:CT_PHASE7E3_CREDIT_NOTE_GUARD' \
  'backend/CurvTabDental.API/Controllers/InvoicesController.cs:CT_PHASE7E3_PATIENT_PAYMENT_GUARD' \
  'frontend/src/pages/MedicalAidRemittanceMatchingPanel.tsx:CT_PHASE7E3_ACTIONS_UI'; do
  file=${item%%:*}; marker=${item#*:}
  grep -q "$marker" "$file" || { echo "MISSING: $marker"; exit 1; }
  printf 'OK: %s\n' "$marker"
done
printf '\n=== CURRENT DATABASE: READ-ONLY FINANCIAL CHECKS ===\n'
docker exec -i curvtab-db psql -X -U curvtab -d curvtabdb -v ON_ERROR_STOP=1 <<'SQL'
SELECT COUNT(*) AS practice_allocations FROM "MedicalAidInvoiceAllocations";
SELECT COUNT(*) AS practice_reversals FROM "MedicalAidInvoiceAllocationReversals";
SELECT COALESCE(SUM("MatchedAmount"),0) AS practice_matched FROM "MedicalAidRemittanceMatches";
SQL
printf '\n=== ISOLATED TEST DATABASE: READ-ONLY FINANCIAL CHECKS ===\n'
docker exec -i curvtab-db psql -X -U curvtab -d curvtab_settlement_test -v ON_ERROR_STOP=1 <<'SQL'
SELECT COUNT(*) AS test_patients FROM "Patients";
SELECT COUNT(*) AS test_allocations FROM "MedicalAidInvoiceAllocations";
SELECT COUNT(*) AS test_reversals FROM "MedicalAidInvoiceAllocationReversals";
SELECT EXISTS (
 SELECT 1 FROM pg_indexes
 WHERE tablename='MedicalAidInvoiceAllocations' AND indexdef ILIKE '%UNIQUE%'
   AND indexdef LIKE '%"DentalPracticeId", "RequestId"%'
) AS has_idempotency_unique_index;
SELECT EXISTS (
 SELECT 1 FROM pg_indexes
 WHERE tablename='MedicalAidInvoiceAllocationReversals' AND indexdef ILIKE '%UNIQUE%'
   AND indexdef LIKE '%"DentalPracticeId", "AllocationId"%'
) AS has_one_reversal_unique_index;
SQL
printf '\n=== AUTH PROTECTION ===\n'
for port in 8080 8081; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/finance/medical-aid/invoice-settlement/allocations")
  printf 'port %s unauthenticated allocations GET HTTP %s (expect 401)\n' "$port" "$code"
  [[ "$code" == '401' ]] || exit 1
done
printf '\nStatic checks passed. This DOES NOT replace authenticated posting/reversal/concurrency tests.\n'
