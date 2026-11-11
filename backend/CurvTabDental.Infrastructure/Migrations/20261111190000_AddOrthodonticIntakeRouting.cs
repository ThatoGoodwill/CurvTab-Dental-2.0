using System;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261111190000_AddOrthodonticIntakeRouting")]
public partial class AddOrthodonticIntakeRouting : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "OrthodonticIntakes",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                Source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                Status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                ReferralAuthorUserId = table.Column<Guid>(type: "uuid", nullable: true),
                AssignedOrthodontistUserId = table.Column<Guid>(type: "uuid", nullable: true),
                ReferralReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                ReferralNotes = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                PreviousProvider = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: true),
                ExistingAppliances = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                PreviousTreatmentStartDate = table.Column<DateOnly>(type: "date", nullable: true),
                PreviousTreatmentPlanSummary = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                TransferReason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                PreviousRecordsSummary = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                UrgentConcerns = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                DocumentReferencesJson = table.Column<string>(type: "jsonb", nullable: false, defaultValue: "[]"),
                MissingDocumentsJson = table.Column<string>(type: "jsonb", nullable: false, defaultValue: "[]"),
                HistoryVerifiedByClinician = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                HistoryVerifiedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                HistoryVerifiedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                TermsApplicable = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                TermsVersion = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                TermsFullText = table.Column<string>(type: "text", nullable: true),
                TermsSha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                TermsSignerName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                TermsSignerCapacity = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                TermsSignatureDataUrl = table.Column<string>(type: "text", nullable: true),
                TermsAcceptedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                TermsAcceptanceMethod = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                AdvancePolicy = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false, defaultValue: "REVIEW_REQUIRED"),
                AdvancePaymentId = table.Column<Guid>(type: "uuid", nullable: true),
                NextAction = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                DueDate = table.Column<DateOnly>(type: "date", nullable: true),
                AssessmentStartedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                AssessmentStartedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                ClosedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_OrthodonticIntakes", x => x.Id);
                table.ForeignKey(
                    name: "FK_OrthodonticIntakes_Patients_PatientId",
                    column: x => x.PatientId,
                    principalTable: "Patients",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakes_DentalPracticeId_PatientId_Open",
            table: "OrthodonticIntakes",
            columns: new[] { "DentalPracticeId", "PatientId" },
            unique: true,
            filter: "\"ClosedAtUtc\" IS NULL");

        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakes_DentalPracticeId_AssignedOrthodontistUserId_Status",
            table: "OrthodonticIntakes",
            columns: new[] { "DentalPracticeId", "AssignedOrthodontistUserId", "Status" });

        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakes_PatientId",
            table: "OrthodonticIntakes",
            column: "PatientId");

        migrationBuilder.Sql("""
            ALTER TABLE "OrthodonticIntakes"
            ADD CONSTRAINT "CK_OrthodonticIntakes_Source"
            CHECK ("Source" IN ('DIRECT','INTERNAL','TRANSFER_IN'));
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "OrthodonticIntakes");
    }
}
