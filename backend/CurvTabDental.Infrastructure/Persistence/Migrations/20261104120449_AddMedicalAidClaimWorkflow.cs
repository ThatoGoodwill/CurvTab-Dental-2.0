using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMedicalAidClaimWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ApprovedAmount",
                table: "MedicalAidClaims",
                type: "numeric(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExternalReference",
                table: "MedicalAidClaims",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastStatusAtUtc",
                table: "MedicalAidClaims",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "MedicalAidClaimEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ToStatus = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ApprovedAmount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    ExternalReference = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    EvidenceReference = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    PerformedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PerformedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicalAidClaimEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalAidClaimEvents_MedicalAidClaims_ClaimId",
                        column: x => x.ClaimId,
                        principalTable: "MedicalAidClaims",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidClaimEvents_ClaimId",
                table: "MedicalAidClaimEvents",
                column: "ClaimId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidClaimEvents_DentalPracticeId_ClaimId_PerformedAtU~",
                table: "MedicalAidClaimEvents",
                columns: new[] { "DentalPracticeId", "ClaimId", "PerformedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidClaimEvents_DentalPracticeId_RequestId",
                table: "MedicalAidClaimEvents",
                columns: new[] { "DentalPracticeId", "RequestId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicalAidClaimEvents");

            migrationBuilder.DropColumn(
                name: "ApprovedAmount",
                table: "MedicalAidClaims");

            migrationBuilder.DropColumn(
                name: "ExternalReference",
                table: "MedicalAidClaims");

            migrationBuilder.DropColumn(
                name: "LastStatusAtUtc",
                table: "MedicalAidClaims");
        }
    }
}
