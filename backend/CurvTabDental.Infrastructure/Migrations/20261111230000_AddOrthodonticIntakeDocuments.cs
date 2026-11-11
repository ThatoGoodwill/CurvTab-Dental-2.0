using System;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace CurvTabDental.Infrastructure.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261111230000_AddOrthodonticIntakeDocuments")]
public partial class AddOrthodonticIntakeDocuments : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "OrthodonticIntakeDocuments",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                IntakeId = table.Column<Guid>(type: "uuid", nullable: false),
                UploadedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                Category = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                OriginalFileName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                ContentType = table.Column<string>(type: "character varying(70)", maxLength: 70, nullable: false),
                SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                Sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                Content = table.Column<byte[]>(type: "bytea", nullable: false),
                UploadedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_OrthodonticIntakeDocuments", x => x.Id);
                table.ForeignKey("FK_OrthodonticIntakeDocuments_OrthodonticIntakes_IntakeId",
                    x => x.IntakeId, "OrthodonticIntakes", "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_OrthodonticIntakeDocuments_Patients_PatientId",
                    x => x.PatientId, "Patients", "Id",
                    onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeDocuments_DentalPracticeId_IntakeId_UploadedAtUtc",
            table: "OrthodonticIntakeDocuments",
            columns: new[] { "DentalPracticeId", "IntakeId", "UploadedAtUtc" });
        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeDocuments_IntakeId",
            table: "OrthodonticIntakeDocuments", column: "IntakeId");
        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeDocuments_PatientId",
            table: "OrthodonticIntakeDocuments", column: "PatientId");
    }
    protected override void Down(MigrationBuilder migrationBuilder) =>
        migrationBuilder.DropTable(name: "OrthodonticIntakeDocuments");
}
