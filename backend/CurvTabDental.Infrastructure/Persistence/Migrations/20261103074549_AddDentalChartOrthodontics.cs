using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDentalChartOrthodontics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DentalChartEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    RecordedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToothCode = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    Surface = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Finding = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DentalChartEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DentalChartEntries_Consultations_ConsultationId",
                        column: x => x.ConsultationId,
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DentalChartEntries_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OrthodonticCases",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ApplianceType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Goals = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    NextReviewDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrthodonticCases", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrthodonticCases_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OrthodonticProgressNotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrthodonticCaseId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecordedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    VisitDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ProgressNotes = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: false),
                    Adjustments = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    NextSteps = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    NextReviewDate = table.Column<DateOnly>(type: "date", nullable: true),
                    RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrthodonticProgressNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrthodonticProgressNotes_OrthodonticCases_OrthodonticCaseId",
                        column: x => x.OrthodonticCaseId,
                        principalTable: "OrthodonticCases",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DentalChartEntries_ConsultationId",
                table: "DentalChartEntries",
                column: "ConsultationId");

            migrationBuilder.CreateIndex(
                name: "IX_DentalChartEntries_DentalPracticeId_PatientId_RecordedAtUtc",
                table: "DentalChartEntries",
                columns: new[] { "DentalPracticeId", "PatientId", "RecordedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_DentalChartEntries_PatientId",
                table: "DentalChartEntries",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_OrthodonticCases_DentalPracticeId_PatientId",
                table: "OrthodonticCases",
                columns: new[] { "DentalPracticeId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_OrthodonticCases_PatientId",
                table: "OrthodonticCases",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_OrthodonticProgressNotes_DentalPracticeId_OrthodonticCaseId~",
                table: "OrthodonticProgressNotes",
                columns: new[] { "DentalPracticeId", "OrthodonticCaseId", "VisitDate" });

            migrationBuilder.CreateIndex(
                name: "IX_OrthodonticProgressNotes_OrthodonticCaseId",
                table: "OrthodonticProgressNotes",
                column: "OrthodonticCaseId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DentalChartEntries");

            migrationBuilder.DropTable(
                name: "OrthodonticProgressNotes");

            migrationBuilder.DropTable(
                name: "OrthodonticCases");
        }
    }
}
