using System;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CurvTabDental.Infrastructure.Migrations;

// Forward-only addition. Does not modify historical claims, invoices or clinical entries.
[DbContext(typeof(DentalDbContext))]
[Migration("20261110173000_BillingClaimSubmissionSnapshots")]
public sealed class BillingClaimSubmissionSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "BillingClaimSubmissionAttempts",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                ClaimId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                AttemptNumber = table.Column<int>(type: "integer", nullable: false),
                ExternalReference = table.Column<string>(type: "character varying(120)", nullable: false),
                EvidenceReference = table.Column<string>(type: "character varying(300)", nullable: false),
                PayloadJson = table.Column<string>(type: "jsonb", nullable: false),
                RecordedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_BillingClaimSubmissionAttempts", x => x.Id);
                table.ForeignKey("FK_BillingClaimSubmissionAttempts_MedicalAidClaims_ClaimId",
                    x => x.ClaimId, "MedicalAidClaims", "Id", onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex(
            "IX_BillingClaimSubmissionAttempts_Request",
            "BillingClaimSubmissionAttempts", new[] { "DentalPracticeId", "RequestId" }, unique: true);
        migrationBuilder.CreateIndex(
            "IX_BillingClaimSubmissionAttempts_Claim_Attempt",
            "BillingClaimSubmissionAttempts", new[] { "DentalPracticeId", "ClaimId", "AttemptNumber" }, unique: true);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("BillingClaimSubmissionAttempts");
    }
}
