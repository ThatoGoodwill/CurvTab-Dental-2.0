using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Migrations;

// A fresh test database receives the two formerly manual-SQL plan tables.
// Existing production tables are retained untouched (IF NOT EXISTS).
// Transfers and refusals are append-only audit records; no receipt is created.
[DbContext(typeof(DentalDbContext))]
[Migration("20261113110000_AddPlanAdvanceTransferAndProcedureDecisions")]
public sealed class AddPlanAdvanceTransferAndProcedureDecisions : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
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
              "Reference" character varying(100),
              "ReceivedAtUtc" timestamptz NOT NULL DEFAULT now(),
              "ReceivedByUserId" uuid NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PlanPayments_DentalPracticeId_RequestId"
              ON "PlanPayments" ("DentalPracticeId","RequestId");
            CREATE INDEX IF NOT EXISTS "IX_PlanPayments_DentalPracticeId_TreatmentPlanId"
              ON "PlanPayments" ("DentalPracticeId","TreatmentPlanId");
            CREATE INDEX IF NOT EXISTS "IX_PlanPayments_DentalPracticeId_ReceivedAtUtc"
              ON "PlanPayments" ("DentalPracticeId","ReceivedAtUtc");

            CREATE TABLE IF NOT EXISTS "PlanPaymentAllocations" (
              "Id" uuid NOT NULL PRIMARY KEY,
              "DentalPracticeId" uuid NOT NULL,
              "TreatmentPlanId" uuid NOT NULL,
              "BatchId" uuid NOT NULL,
              "ProcedureId" uuid NOT NULL,
              "Amount" numeric(12,2) NOT NULL,
              "CreatedAtUtc" timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS "IX_PlanPaymentAllocations_DentalPracticeId_TreatmentPlanId"
              ON "PlanPaymentAllocations" ("DentalPracticeId","TreatmentPlanId");
            CREATE INDEX IF NOT EXISTS "IX_PlanPaymentAllocations_DentalPracticeId_ProcedureId"
              ON "PlanPaymentAllocations" ("DentalPracticeId","ProcedureId");

            CREATE TABLE IF NOT EXISTS "PlanAdvanceTransfers" (
              "Id" uuid NOT NULL PRIMARY KEY,
              "DentalPracticeId" uuid NOT NULL,
              "PatientId" uuid NOT NULL,
              "TreatmentPlanId" uuid NOT NULL REFERENCES "PatientTreatmentPlans"("Id") ON DELETE RESTRICT,
              "FromProcedureId" uuid NOT NULL REFERENCES "PatientTreatmentProcedures"("Id") ON DELETE RESTRICT,
              "ToProcedureId" uuid NOT NULL REFERENCES "PatientTreatmentProcedures"("Id") ON DELETE RESTRICT,
              "RequestId" uuid NOT NULL,
              "Amount" numeric(12,2) NOT NULL CHECK ("Amount" > 0),
              "Reason" character varying(2000) NOT NULL,
              "AuthorizedByPatientName" character varying(200) NOT NULL,
              "RecordedByUserId" uuid NOT NULL,
              "AuthorizedAtUtc" timestamptz NOT NULL DEFAULT now(),
              CONSTRAINT "CK_PlanAdvanceTransfers_DifferentProcedures" CHECK ("FromProcedureId" <> "ToProcedureId")
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PlanAdvanceTransfers_DentalPracticeId_RequestId"
              ON "PlanAdvanceTransfers" ("DentalPracticeId","RequestId");
            CREATE INDEX IF NOT EXISTS "IX_PlanAdvanceTransfers_DentalPracticeId_PatientId_TreatmentPlanId"
              ON "PlanAdvanceTransfers" ("DentalPracticeId","PatientId","TreatmentPlanId");

            CREATE TABLE IF NOT EXISTS "TreatmentProcedureDecisions" (
              "Id" uuid NOT NULL PRIMARY KEY,
              "DentalPracticeId" uuid NOT NULL,
              "PatientId" uuid NOT NULL,
              "TreatmentPlanId" uuid NOT NULL REFERENCES "PatientTreatmentPlans"("Id") ON DELETE RESTRICT,
              "ProcedureId" uuid NOT NULL REFERENCES "PatientTreatmentProcedures"("Id") ON DELETE RESTRICT,
              "DentistUserId" uuid NOT NULL,
              "Decision" character varying(20) NOT NULL,
              "Reason" character varying(2000) NOT NULL,
              "RisksAndAlternativesExplained" character varying(4000) NOT NULL,
              "PatientOrRepresentativeName" character varying(200) NOT NULL,
              "RecordedAtUtc" timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS "IX_TreatmentProcedureDecisions_DentalPracticeId_PatientId_ProcedureId"
              ON "TreatmentProcedureDecisions" ("DentalPracticeId","PatientId","ProcedureId");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Never drop legacy PlanPayments/Allocations: they may predate this migration.
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS "TreatmentProcedureDecisions";
            DROP TABLE IF EXISTS "PlanAdvanceTransfers";
            """);
    }
}
