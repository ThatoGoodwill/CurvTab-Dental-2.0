using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMedicalAidRemittanceAdvice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MedicalAidRemittanceAdvices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uuid", nullable: false),
                    RemittanceReference = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    AdvisedAmount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    RecordedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicalAidRemittanceAdvices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalAidRemittanceAdvices_MedicalAidClaims_ClaimId",
                        column: x => x.ClaimId,
                        principalTable: "MedicalAidClaims",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidRemittanceAdvices_ClaimId",
                table: "MedicalAidRemittanceAdvices",
                column: "ClaimId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidRemittanceAdvices_DentalPracticeId_ClaimId_Remitt~",
                table: "MedicalAidRemittanceAdvices",
                columns: new[] { "DentalPracticeId", "ClaimId", "RemittanceReference" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidRemittanceAdvices_DentalPracticeId_RequestId",
                table: "MedicalAidRemittanceAdvices",
                columns: new[] { "DentalPracticeId", "RequestId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicalAidRemittanceAdvices");
        }
    }
}
