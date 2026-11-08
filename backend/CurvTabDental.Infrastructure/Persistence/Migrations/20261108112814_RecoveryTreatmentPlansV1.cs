using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RecoveryTreatmentPlansV1 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PatientTreatmentPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    DentistUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ClinicalRationale = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Revision = table.Column<int>(type: "integer", nullable: false),
                    ConsentName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ConsentRecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ConsentRecordedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientTreatmentPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientTreatmentPlans_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientTreatmentProcedures",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    TreatmentPlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    ToothCode = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    EstimatedCost = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientTreatmentProcedures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientTreatmentProcedures_PatientTreatmentPlans_TreatmentP~",
                        column: x => x.TreatmentPlanId,
                        principalTable: "PatientTreatmentPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PatientTreatmentProcedures_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientTreatmentPlans_DentalPracticeId_PatientId_CreatedAtU~",
                table: "PatientTreatmentPlans",
                columns: new[] { "DentalPracticeId", "PatientId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientTreatmentPlans_PatientId",
                table: "PatientTreatmentPlans",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientTreatmentProcedures_DentalPracticeId_PatientId_Treat~",
                table: "PatientTreatmentProcedures",
                columns: new[] { "DentalPracticeId", "PatientId", "TreatmentPlanId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientTreatmentProcedures_PatientId",
                table: "PatientTreatmentProcedures",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientTreatmentProcedures_TreatmentPlanId",
                table: "PatientTreatmentProcedures",
                column: "TreatmentPlanId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PatientTreatmentProcedures");

            migrationBuilder.DropTable(
                name: "PatientTreatmentPlans");
        }
    }
}
