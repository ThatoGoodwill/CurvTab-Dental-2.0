using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using CurvTabDental.Infrastructure.Persistence;

#nullable disable

namespace CurvTabDental.Infrastructure.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261111143000_FinancialEvidenceAndSignoff")]
public partial class FinancialEvidenceAndSignoff : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CashDayCloseInstrumentEvidence",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                SubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                Instrument = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                LedgerReceived = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                VerifiedReceived = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                EvidenceReference = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                VerificationSource = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                ExternalSettlementConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                RecordedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CashDayCloseInstrumentEvidence", x => x.Id);
                table.ForeignKey("FK_CashDayCloseInstrumentEvidence_CashDayCloseSubmissions_SubmissionId",
                    x => x.SubmissionId, "CashDayCloseSubmissions", "Id", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateTable(
            name: "CashDayCloseFinancialSignoffs",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                SubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                BusinessDate = table.Column<DateOnly>(type: "date", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                SnapshotJson = table.Column<string>(type: "text", nullable: false),
                HandoverReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                SignedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                SignedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CashDayCloseFinancialSignoffs", x => x.Id);
                table.ForeignKey("FK_CashDayCloseFinancialSignoffs_CashDayCloseSubmissions_SubmissionId",
                    x => x.SubmissionId, "CashDayCloseSubmissions", "Id", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex("IX_CashDayCloseInstrumentEvidence_SubmissionId",
            "CashDayCloseInstrumentEvidence", "SubmissionId");
        migrationBuilder.CreateIndex("IX_CashDayCloseInstrumentEvidence_DentalPracticeId_RequestId",
            "CashDayCloseInstrumentEvidence", new[] { "DentalPracticeId", "RequestId" }, unique: true);
        migrationBuilder.CreateIndex("IX_CashDayCloseInstrumentEvidence_DentalPracticeId_SubmissionId_Instrument_RecordedAtUtc",
            "CashDayCloseInstrumentEvidence", new[] { "DentalPracticeId", "SubmissionId", "Instrument", "RecordedAtUtc" });
        migrationBuilder.CreateIndex("IX_CashDayCloseFinancialSignoffs_SubmissionId",
            "CashDayCloseFinancialSignoffs", "SubmissionId");
        migrationBuilder.CreateIndex("IX_CashDayCloseFinancialSignoffs_DentalPracticeId_BusinessDate",
            "CashDayCloseFinancialSignoffs", new[] { "DentalPracticeId", "BusinessDate" }, unique: true);
        migrationBuilder.CreateIndex("IX_CashDayCloseFinancialSignoffs_DentalPracticeId_RequestId",
            "CashDayCloseFinancialSignoffs", new[] { "DentalPracticeId", "RequestId" }, unique: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "CashDayCloseFinancialSignoffs");
        migrationBuilder.DropTable(name: "CashDayCloseInstrumentEvidence");
    }
}
