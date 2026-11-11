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
                OrthodonticIntakeCaseId = table.Column<Guid>(type: "uuid", nullable: false),
                PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                Category = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                OriginalFileName = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                ContentType = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                FileBytes = table.Column<byte[]>(type: "bytea", nullable: false),
                SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                Sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                SourceProvider = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: true),
                UploadedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                UploadedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                ReviewedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                ReviewedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_OrthodonticIntakeDocuments", x => x.Id);
                table.ForeignKey(
                    name: "FK_OrthodonticIntakeDocuments_OrthodonticIntakes_OrthodonticIntakeCaseId",
                    column: x => x.OrthodonticIntakeCaseId,
                    principalTable: "OrthodonticIntakes",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_OrthodonticIntakeDocuments_Patients_PatientId",
                    column: x => x.PatientId,
                    principalTable: "Patients",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeDocuments_DentalPracticeId_OrthodonticIntakeCaseId_UploadedAtUtc",
            table: "OrthodonticIntakeDocuments",
            columns: new[] { "DentalPracticeId", "OrthodonticIntakeCaseId", "UploadedAtUtc" });

        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeDocuments_DentalPracticeId_PatientId",
            table: "OrthodonticIntakeDocuments",
            columns: new[] { "DentalPracticeId", "PatientId" });
        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeDocuments_OrthodonticIntakeCaseId",
            table: "OrthodonticIntakeDocuments",
            column: "OrthodonticIntakeCaseId");
        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeDocuments_PatientId",
            table: "OrthodonticIntakeDocuments",
            column: "PatientId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropTable("OrthodonticIntakeDocuments");
}
