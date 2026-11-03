using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddClinicalConsultationsPhase2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Consultations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    AppointmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    DentistUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ChiefComplaint = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: true),
                    Symptoms = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: true),
                    ExaminationFindings = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: true),
                    Diagnosis = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: true),
                    TreatmentPerformed = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: true),
                    TreatmentPlan = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: true),
                    PrescriptionNotes = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: true),
                    FollowUpAdvice = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: true),
                    ChargesConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    IsFinalized = table.Column<bool>(type: "boolean", nullable: false),
                    FinalizedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Consultations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Consultations_Appointments_AppointmentId",
                        column: x => x.AppointmentId,
                        principalTable: "Appointments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Consultations_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientMedicalHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Allergies = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    CurrentMedications = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    MedicalConditions = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    DentalHistory = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    AdditionalNotes = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientMedicalHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientMedicalHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ConsultationCharges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsultationCharges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ConsultationCharges_Consultations_ConsultationId",
                        column: x => x.ConsultationId,
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsultationCharges_ConsultationId",
                table: "ConsultationCharges",
                column: "ConsultationId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsultationCharges_DentalPracticeId_ConsultationId",
                table: "ConsultationCharges",
                columns: new[] { "DentalPracticeId", "ConsultationId" });

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_AppointmentId",
                table: "Consultations",
                column: "AppointmentId");

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_DentalPracticeId_AppointmentId",
                table: "Consultations",
                columns: new[] { "DentalPracticeId", "AppointmentId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_DentalPracticeId_PatientId",
                table: "Consultations",
                columns: new[] { "DentalPracticeId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_PatientId",
                table: "Consultations",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientMedicalHistories_DentalPracticeId_PatientId",
                table: "PatientMedicalHistories",
                columns: new[] { "DentalPracticeId", "PatientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientMedicalHistories_PatientId",
                table: "PatientMedicalHistories",
                column: "PatientId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConsultationCharges");

            migrationBuilder.DropTable(
                name: "PatientMedicalHistories");

            migrationBuilder.DropTable(
                name: "Consultations");
        }
    }
}
