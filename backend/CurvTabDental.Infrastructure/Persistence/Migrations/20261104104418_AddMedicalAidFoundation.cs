using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMedicalAidFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MedicalAidMemberships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    SchemeName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    PlanName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    MemberNumberLast4 = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    RecordedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicalAidMemberships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalAidMemberships_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MedicalAidClaims",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    MembershipId = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    ClaimedAmount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicalAidClaims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalAidClaims_Invoice_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoice",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MedicalAidClaims_MedicalAidMemberships_MembershipId",
                        column: x => x.MembershipId,
                        principalTable: "MedicalAidMemberships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MedicalAidClaims_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidClaims_DentalPracticeId_ClaimNumber",
                table: "MedicalAidClaims",
                columns: new[] { "DentalPracticeId", "ClaimNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidClaims_DentalPracticeId_InvoiceId",
                table: "MedicalAidClaims",
                columns: new[] { "DentalPracticeId", "InvoiceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidClaims_DentalPracticeId_PatientId",
                table: "MedicalAidClaims",
                columns: new[] { "DentalPracticeId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidClaims_DentalPracticeId_RequestId",
                table: "MedicalAidClaims",
                columns: new[] { "DentalPracticeId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidClaims_InvoiceId",
                table: "MedicalAidClaims",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidClaims_MembershipId",
                table: "MedicalAidClaims",
                column: "MembershipId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidClaims_PatientId",
                table: "MedicalAidClaims",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidMemberships_DentalPracticeId_PatientId",
                table: "MedicalAidMemberships",
                columns: new[] { "DentalPracticeId", "PatientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidMemberships_PatientId",
                table: "MedicalAidMemberships",
                column: "PatientId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicalAidClaims");

            migrationBuilder.DropTable(
                name: "MedicalAidMemberships");
        }
    }
}
