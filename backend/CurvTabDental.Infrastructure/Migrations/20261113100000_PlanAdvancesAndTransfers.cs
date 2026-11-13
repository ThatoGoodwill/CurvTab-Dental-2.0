using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261113100000_PlanAdvancesAndTransfers")]
public sealed class PlanAdvancesAndTransfers : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Historical production already ran plan-account.sql by hand; both
        // table creation and indexes therefore must be strictly additive.
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "PlanPayments" (
                "Id" uuid NOT NULL PRIMARY KEY,
                "DentalPracticeId" uuid NOT NULL,
                "PatientId" uuid NOT NULL,
                "TreatmentPlanId" uuid NOT NULL,
                "BatchId" uuid NOT NULL,
                "RequestId" uuid NOT NULL,
                "ReceiptNumber" varchar(60) NOT NULL,
                "Amount" numeric(12,2) NOT NULL,
                "Method" varchar(10) NOT NULL,
                "Reference" varchar(100),
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
            CREATE TABLE IF NOT EXISTS "PlanAllocationTransfers" (
                "Id" uuid NOT NULL PRIMARY KEY,
                "DentalPracticeId" uuid NOT NULL,
                "TreatmentPlanId" uuid NOT NULL,
                "FromProcedureId" uuid NOT NULL,
                "ToProcedureId" uuid NOT NULL,
                "RequestId" uuid NOT NULL,
                "Amount" numeric(12,2) NOT NULL,
                "PatientAuthorization" varchar(200) NOT NULL,
                "Reason" varchar(1000) NOT NULL,
                "AuthorizedByUserId" uuid NOT NULL,
                "CreatedAtUtc" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "CK_PlanAllocationTransfers_Positive" CHECK ("Amount" > 0),
                CONSTRAINT "CK_PlanAllocationTransfers_Different" CHECK ("FromProcedureId" <> "ToProcedureId")
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PlanAllocationTransfers_DentalPracticeId_RequestId"
                ON "PlanAllocationTransfers" ("DentalPracticeId","RequestId");
            CREATE INDEX IF NOT EXISTS "IX_PlanAllocationTransfers_DentalPracticeId_TreatmentPlanId"
                ON "PlanAllocationTransfers" ("DentalPracticeId","TreatmentPlanId");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Never automatically drop existing receipt tables or historical movements.
        throw new NotSupportedException("Financial data retention: automatic down-migration is prohibited.");
    }
}
