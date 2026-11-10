using System;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CurvTabDental.Infrastructure.Migrations;

// Additive, independently auditable Billing day sign-off infrastructure.
[DbContext(typeof(DentalDbContext))]
[Migration("20261110165000_ClientBillingSeparateSignoffs")]
public sealed class ClientBillingSeparateSignoffs : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "BillingCashCounts",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                BusinessDate = table.Column<DateOnly>(type: "date", nullable: false),
                Revision = table.Column<int>(type: "integer", nullable: false),
                OpeningFloat = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                CashReceipts = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                CashExpenses = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                CashRefunds = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                ExpectedCash = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                CountedCash = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                Variance = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                DenominationsJson = table.Column<string>(type: "jsonb", nullable: false),
                SubmittedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                SubmittedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BillingCashCounts", x => x.Id);
            });
        migrationBuilder.CreateIndex("IX_BillingCashCounts_DentalPracticeId_RequestId", "BillingCashCounts", new[] { "DentalPracticeId", "RequestId" }, unique: true);
        migrationBuilder.CreateIndex("IX_BillingCashCounts_DentalPracticeId_BusinessDate_Revision", "BillingCashCounts", new[] { "DentalPracticeId", "BusinessDate", "Revision" }, unique: true);

        migrationBuilder.CreateTable(
            name: "BillingCashCountEvents",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                CashCountId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                Action = table.Column<string>(type: "character varying(25)", nullable: false),
                Notes = table.Column<string>(type: "character varying(1500)", nullable: false),
                EvidenceReference = table.Column<string>(type: "character varying(300)", nullable: false),
                ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                AtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BillingCashCountEvents", x => x.Id);
                table.ForeignKey("FK_BillingCashCountEvents_BillingCashCounts_CashCountId", x => x.CashCountId, "BillingCashCounts", "Id", onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex("IX_BillingCashCountEvents_DentalPracticeId_RequestId", "BillingCashCountEvents", new[] { "DentalPracticeId", "RequestId" }, unique: true);
        migrationBuilder.CreateIndex("IX_BillingCashCountEvents_DentalPracticeId_CashCountId_AtUtc", "BillingCashCountEvents", new[] { "DentalPracticeId", "CashCountId", "AtUtc" }, unique: false);

        migrationBuilder.CreateTable(
            name: "BillingMedicalAidDaySignoffs",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                BusinessDate = table.Column<DateOnly>(type: "date", nullable: false),
                PatientsTreated = table.Column<int>(type: "integer", nullable: false),
                UniqueClaims = table.Column<int>(type: "integer", nullable: false),
                SubmissionAttempts = table.Column<int>(type: "integer", nullable: false),
                SubmittedValue = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                ActionPending = table.Column<int>(type: "integer", nullable: false),
                SnapshotJson = table.Column<string>(type: "jsonb", nullable: false),
                Notes = table.Column<string>(type: "character varying(1500)", nullable: false),
                SignedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                SignedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BillingMedicalAidDaySignoffs", x => x.Id);
            });
        migrationBuilder.CreateIndex("IX_BillingMedicalAidDaySignoffs_DentalPracticeId_RequestId", "BillingMedicalAidDaySignoffs", new[] { "DentalPracticeId", "RequestId" }, unique: true);
        migrationBuilder.CreateIndex("IX_BillingMedicalAidDaySignoffs_DentalPracticeId_BusinessDat", "BillingMedicalAidDaySignoffs", new[] { "DentalPracticeId", "BusinessDate" }, unique: true);

        migrationBuilder.CreateTable(
            name: "BillingClaimCorrections",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                ClaimId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                Version = table.Column<int>(type: "integer", nullable: false),
                InvoiceLineId = table.Column<Guid>(type: "uuid", nullable: false),
                PreviousCode = table.Column<string>(type: "character varying(40)", nullable: false),
                CorrectedCode = table.Column<string>(type: "character varying(40)", nullable: false),
                Reason = table.Column<string>(type: "character varying(1000)", nullable: false),
                EvidenceReference = table.Column<string>(type: "character varying(300)", nullable: false),
                ApprovedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                ApprovedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BillingClaimCorrections", x => x.Id);
                table.ForeignKey("FK_BillingClaimCorrections_MedicalAidClaims_ClaimId", x => x.ClaimId, "MedicalAidClaims", "Id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_BillingClaimCorrections_InvoiceLine_InvoiceLineId", x => x.InvoiceLineId, "InvoiceLine", "Id", onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex("IX_BillingClaimCorrections_DentalPracticeId_RequestId", "BillingClaimCorrections", new[] { "DentalPracticeId", "RequestId" }, unique: true);
        migrationBuilder.CreateIndex("IX_BillingClaimCorrections_DentalPracticeId_ClaimId_Version", "BillingClaimCorrections", new[] { "DentalPracticeId", "ClaimId", "Version" }, unique: true);

        migrationBuilder.CreateTable(
            name: "BillingPaymentRefunds",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                RefundedOn = table.Column<DateOnly>(type: "date", nullable: false),
                Method = table.Column<string>(type: "character varying(16)", nullable: false),
                Amount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                Reason = table.Column<string>(type: "character varying(1000)", nullable: false),
                EvidenceReference = table.Column<string>(type: "character varying(300)", nullable: false),
                ApprovedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BillingPaymentRefunds", x => x.Id);
                table.ForeignKey("FK_BillingPaymentRefunds_Payments_PaymentId", x => x.PaymentId, "Payments", "Id", onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex("IX_BillingPaymentRefunds_DentalPracticeId_RequestId", "BillingPaymentRefunds", new[] { "DentalPracticeId", "RequestId" }, unique: true);
        migrationBuilder.CreateIndex("IX_BillingPaymentRefunds_DentalPracticeId_RefundedOn", "BillingPaymentRefunds", new[] { "DentalPracticeId", "RefundedOn" }, unique: false);

        migrationBuilder.CreateTable(
            name: "BillingExpenseApprovalRequests",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                ExpenseDate = table.Column<DateOnly>(type: "date", nullable: false),
                Supplier = table.Column<string>(type: "character varying(120)", nullable: false),
                Category = table.Column<string>(type: "character varying(60)", nullable: false),
                Description = table.Column<string>(type: "character varying(250)", nullable: false),
                Method = table.Column<string>(type: "character varying(16)", nullable: false),
                Reference = table.Column<string>(type: "character varying(100)", nullable: false),
                ReceiptReference = table.Column<string>(type: "character varying(300)", nullable: false),
                Amount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                RequestedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BillingExpenseApprovalRequests", x => x.Id);
            });
        migrationBuilder.CreateIndex("IX_BillingExpenseApprovalRequests_DentalPracticeId_RequestId", "BillingExpenseApprovalRequests", new[] { "DentalPracticeId", "RequestId" }, unique: true);
        migrationBuilder.CreateIndex("IX_BillingExpenseApprovalRequests_DentalPracticeId_ExpenseDa", "BillingExpenseApprovalRequests", new[] { "DentalPracticeId", "ExpenseDate" }, unique: false);

        migrationBuilder.CreateTable(
            name: "BillingExpenseDecisions",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                ExpenseRequestId = table.Column<Guid>(type: "uuid", nullable: false),
                Decision = table.Column<string>(type: "character varying(20)", nullable: false),
                Notes = table.Column<string>(type: "character varying(1000)", nullable: false),
                PostedExpenseId = table.Column<Guid>(type: "uuid", nullable: true),
                DecidedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                DecidedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BillingExpenseDecisions", x => x.Id);
                table.ForeignKey("FK_BillingExpenseDecisions_BillingExpenseApprovalRequests_ExpenseRequestId", x => x.ExpenseRequestId, "BillingExpenseApprovalRequests", "Id", onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex("IX_BillingExpenseDecisions_DentalPracticeId_RequestId", "BillingExpenseDecisions", new[] { "DentalPracticeId", "RequestId" }, unique: true);
        migrationBuilder.CreateIndex("IX_BillingExpenseDecisions_DentalPracticeId_ExpenseRequestId", "BillingExpenseDecisions", new[] { "DentalPracticeId", "ExpenseRequestId" }, unique: true);

    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Explicit rollback only. The forward migration never deletes existing records.
        migrationBuilder.DropTable("BillingExpenseDecisions");
        migrationBuilder.DropTable("BillingExpenseApprovalRequests");
        migrationBuilder.DropTable("BillingPaymentRefunds");
        migrationBuilder.DropTable("BillingClaimCorrections");
        migrationBuilder.DropTable("BillingMedicalAidDaySignoffs");
        migrationBuilder.DropTable("BillingCashCountEvents");
        migrationBuilder.DropTable("BillingCashCounts");
    }
}
