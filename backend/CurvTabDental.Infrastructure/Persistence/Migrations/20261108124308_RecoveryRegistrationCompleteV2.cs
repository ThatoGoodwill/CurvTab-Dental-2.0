using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RecoveryRegistrationCompleteV2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PatientRegistrationDetails",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    HomePhone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    WorkPhone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Occupation = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    Employer = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ResponsibleName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ResponsibleRelationship = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ResponsiblePhone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    ResponsibleEmail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ResponsibleAddress = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ResponsibleIdNumber = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    DeclarationAccepted = table.Column<bool>(type: "boolean", nullable: false),
                    InformationConsent = table.Column<bool>(type: "boolean", nullable: false),
                    SignerName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    SignerCapacity = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    SignatureDataUrl = table.Column<string>(type: "text", nullable: false),
                    WitnessName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    WitnessSignatureDataUrl = table.Column<string>(type: "text", nullable: true),
                    DeclarationVersion = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SignedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RecordedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientRegistrationDetails", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientRegistrationDetails_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientRegistrationDetails_DentalPracticeId_PatientId",
                table: "PatientRegistrationDetails",
                columns: new[] { "DentalPracticeId", "PatientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientRegistrationDetails_PatientId",
                table: "PatientRegistrationDetails",
                column: "PatientId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PatientRegistrationDetails");
        }
    }
}
