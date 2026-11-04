using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMedicalAidAuthorisations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MedicalAidAuthorisations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    MembershipId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    TreatmentDescription = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    RequestedAmount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    ApprovedAmount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    Status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    AuthorisationNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExpiresOn = table.Column<DateOnly>(type: "date", nullable: true),
                    EvidenceReference = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicalAidAuthorisations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalAidAuthorisations_MedicalAidMemberships_MembershipId",
                        column: x => x.MembershipId,
                        principalTable: "MedicalAidMemberships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MedicalAidAuthorisations_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MedicalAidAuthorisationEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorisationId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ToStatus = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ApprovedAmount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    AuthorisationNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExpiresOn = table.Column<DateOnly>(type: "date", nullable: true),
                    EvidenceReference = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    PerformedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PerformedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicalAidAuthorisationEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalAidAuthorisationEvents_MedicalAidAuthorisations_Auth~",
                        column: x => x.AuthorisationId,
                        principalTable: "MedicalAidAuthorisations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidAuthorisationEvents_AuthorisationId",
                table: "MedicalAidAuthorisationEvents",
                column: "AuthorisationId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidAuthorisationEvents_DentalPracticeId_Authorisatio~",
                table: "MedicalAidAuthorisationEvents",
                columns: new[] { "DentalPracticeId", "AuthorisationId", "PerformedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidAuthorisations_DentalPracticeId_PatientId",
                table: "MedicalAidAuthorisations",
                columns: new[] { "DentalPracticeId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidAuthorisations_DentalPracticeId_RequestId",
                table: "MedicalAidAuthorisations",
                columns: new[] { "DentalPracticeId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidAuthorisations_MembershipId",
                table: "MedicalAidAuthorisations",
                column: "MembershipId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidAuthorisations_PatientId",
                table: "MedicalAidAuthorisations",
                column: "PatientId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicalAidAuthorisationEvents");

            migrationBuilder.DropTable(
                name: "MedicalAidAuthorisations");
        }
    }
}
