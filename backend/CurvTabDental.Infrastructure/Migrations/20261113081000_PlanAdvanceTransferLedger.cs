using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace CurvTabDental.Infrastructure.Migrations;

// Adopt historical plan-payment tables where they already exist; install them
// on fresh databases. Never clear or rewrite historical plan receipts.
[DbContext(typeof(DentalDbContext))]
[Migration("20261113081000_PlanAdvanceTransferLedger")]
public sealed class PlanAdvanceTransferLedger : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "PlanPayments" (
              "Id" uuid NOT NULL PRIMARY KEY, "DentalPracticeId" uuid NOT NULL,
              "PatientId" uuid NOT NULL, "TreatmentPlanId" uuid NOT NULL,
              "BatchId" uuid NOT NULL, "RequestId" uuid NOT NULL,
              "ReceiptNumber" varchar(60) NOT NULL, "Amount" numeric(12,2) NOT NULL,
              "Method" varchar(10) NOT NULL, "Reference" varchar(100) NULL,
              "ReceivedAtUtc" timestamptz NOT NULL DEFAULT now(), "ReceivedByUserId" uuid NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PlanPayments_DentalPracticeId_RequestId"
              ON "PlanPayments" ("DentalPracticeId", "RequestId");
            CREATE INDEX IF NOT EXISTS "IX_PlanPayments_DentalPracticeId_TreatmentPlanId"
              ON "PlanPayments" ("DentalPracticeId", "TreatmentPlanId");
            CREATE INDEX IF NOT EXISTS "IX_PlanPayments_DentalPracticeId_ReceivedAtUtc"
              ON "PlanPayments" ("DentalPracticeId", "ReceivedAtUtc");

            CREATE TABLE IF NOT EXISTS "PlanPaymentAllocations" (
              "Id" uuid NOT NULL PRIMARY KEY, "DentalPracticeId" uuid NOT NULL,
              "TreatmentPlanId" uuid NOT NULL, "BatchId" uuid NOT NULL,
              "ProcedureId" uuid NOT NULL, "Amount" numeric(12,2) NOT NULL,
              "CreatedAtUtc" timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS "IX_PlanPaymentAllocations_DentalPracticeId_TreatmentPlanId"
              ON "PlanPaymentAllocations" ("DentalPracticeId", "TreatmentPlanId");
            CREATE INDEX IF NOT EXISTS "IX_PlanPaymentAllocations_DentalPracticeId_ProcedureId"
              ON "PlanPaymentAllocations" ("DentalPracticeId", "ProcedureId");

            CREATE TABLE IF NOT EXISTS "PlanAdvanceTransfers" (
              "Id" uuid NOT NULL PRIMARY KEY, "DentalPracticeId" uuid NOT NULL,
              "PatientId" uuid NOT NULL, "TreatmentPlanId" uuid NOT NULL,
              "RequestId" uuid NOT NULL,
              "FromProcedureId" uuid NOT NULL, "ToProcedureId" uuid NOT NULL,
              "Amount" numeric(12,2) NOT NULL,
              "AuthorizationName" varchar(200) NOT NULL,
              "AuthorizationNote" varchar(2000) NOT NULL,
              "AuthorizedByUserId" uuid NOT NULL, "CreatedAtUtc" timestamptz NOT NULL DEFAULT now(),
              CONSTRAINT "CK_PlanAdvanceTransfers_Positive" CHECK ("Amount" > 0),
              CONSTRAINT "CK_PlanAdvanceTransfers_Distinct" CHECK ("FromProcedureId" <> "ToProcedureId")
            );
            CREATE TABLE IF NOT EXISTS "PatientProcedureDecisions" (
              "Id" uuid NOT NULL PRIMARY KEY,
              "DentalPracticeId" uuid NOT NULL,
              "PatientId" uuid NOT NULL,
              "TreatmentPlanId" uuid NOT NULL,
              "ProcedureId" uuid NOT NULL,
              "AppointmentId" uuid NULL,
              "Decision" varchar(24) NOT NULL,
              "ClinicalReason" varchar(3000) NOT NULL,
              "RisksExplained" varchar(3000) NOT NULL,
              "AlternativesExplained" varchar(3000) NOT NULL,
              "PatientResponse" varchar(3000) NOT NULL,
              "RecordedByUserId" uuid NOT NULL,
              "RecordedAtUtc" timestamptz NOT NULL DEFAULT now()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PatientProcedureDecisions_DentalPracticeId_ProcedureId"
              ON "PatientProcedureDecisions" ("DentalPracticeId", "ProcedureId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PlanAdvanceTransfers_DentalPracticeId_RequestId"
              ON "PlanAdvanceTransfers" ("DentalPracticeId", "RequestId");
            CREATE INDEX IF NOT EXISTS "IX_PlanAdvanceTransfers_DentalPracticeId_TreatmentPlanId"
              ON "PlanAdvanceTransfers" ("DentalPracticeId", "TreatmentPlanId");
            CREATE INDEX IF NOT EXISTS "IX_PlanAdvanceTransfers_DentalPracticeId_FromProcedureId"
              ON "PlanAdvanceTransfers" ("DentalPracticeId", "FromProcedureId");
            CREATE INDEX IF NOT EXISTS "IX_PlanAdvanceTransfers_DentalPracticeId_ToProcedureId"
              ON "PlanAdvanceTransfers" ("DentalPracticeId", "ToProcedureId");
        """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Removing an advance ledger risks destroying financial audit history.
        // Rollback must use a reviewed, explicit financial-data migration.
        throw new InvalidOperationException("Financial receipts and transfer audit records are append-only.");
    }
}
