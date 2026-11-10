-- Safe to run more than once. Lets procedures be flagged as needing lab work.
ALTER TABLE "ProcedurePrices" ADD COLUMN IF NOT EXISTS "RequiresLab" boolean NOT NULL DEFAULT false;
ALTER TABLE "ProcedurePrices" ADD COLUMN IF NOT EXISTS "SupplierEstimate" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "PatientTreatmentProcedures" ADD COLUMN IF NOT EXISTS "RequiresLab" boolean NOT NULL DEFAULT false;
