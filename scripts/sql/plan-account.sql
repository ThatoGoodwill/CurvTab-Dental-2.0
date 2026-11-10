-- Safe to run more than once. Treatment-plan account (advance payments + allocations).
CREATE TABLE IF NOT EXISTS "PlanPayments" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "DentalPracticeId" uuid NOT NULL,
    "PatientId" uuid NOT NULL,
    "TreatmentPlanId" uuid NOT NULL,
    "BatchId" uuid NOT NULL,
    "RequestId" uuid NOT NULL,
    "ReceiptNumber" character varying(60) NOT NULL,
    "Amount" numeric(12,2) NOT NULL,
    "Method" character varying(10) NOT NULL,
    "Reference" character varying(100) NULL,
    "ReceivedAtUtc" timestamp with time zone NOT NULL DEFAULT now(),
    "ReceivedByUserId" uuid NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "IX_PlanPayments_DentalPracticeId_RequestId" ON "PlanPayments" ("DentalPracticeId","RequestId");
CREATE INDEX IF NOT EXISTS "IX_PlanPayments_DentalPracticeId_TreatmentPlanId" ON "PlanPayments" ("DentalPracticeId","TreatmentPlanId");
CREATE INDEX IF NOT EXISTS "IX_PlanPayments_DentalPracticeId_ReceivedAtUtc" ON "PlanPayments" ("DentalPracticeId","ReceivedAtUtc");

CREATE TABLE IF NOT EXISTS "PlanPaymentAllocations" (
    "Id" uuid NOT NULL PRIMARY KEY,
    "DentalPracticeId" uuid NOT NULL,
    "TreatmentPlanId" uuid NOT NULL,
    "BatchId" uuid NOT NULL,
    "ProcedureId" uuid NOT NULL,
    "Amount" numeric(12,2) NOT NULL,
    "CreatedAtUtc" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "IX_PlanPaymentAllocations_DentalPracticeId_TreatmentPlanId" ON "PlanPaymentAllocations" ("DentalPracticeId","TreatmentPlanId");
CREATE INDEX IF NOT EXISTS "IX_PlanPaymentAllocations_DentalPracticeId_ProcedureId" ON "PlanPaymentAllocations" ("DentalPracticeId","ProcedureId");
