using System;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261111233000_AddOrthodonticIntakeAdvanceReceipts")]
public partial class AddOrthodonticIntakeAdvanceReceipts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "OrthodonticIntakeAdvanceReceipts",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                OrthodonticIntakeCaseId = table.Column<Guid>(type: "uuid", nullable: false),
                PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                ReceiptNumber = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                Amount = table.Column<decimal>(type: "numeric(12,2)", nullable: false),
                Method = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                Reference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                ReceivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                ReceivedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                AllocatedOrthodonticAgreementId = table.Column<Guid>(type: "uuid", nullable: true),
                AllocatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_OrthodonticIntakeAdvanceReceipts", x => x.Id);
                table.ForeignKey(
                    name: "FK_OrthodonticIntakeAdvanceReceipts_OrthodonticIntakes_OrthodonticIntakeCaseId",
                    column: x => x.OrthodonticIntakeCaseId,
                    principalTable: "OrthodonticIntakes",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_OrthodonticIntakeAdvanceReceipts_Patients_PatientId",
                    column: x => x.PatientId,
                    principalTable: "Patients",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });
        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeAdvanceReceipts_DentalPracticeId_OrthodonticIntakeCaseId",
            table: "OrthodonticIntakeAdvanceReceipts",
            columns: new[] { "DentalPracticeId", "OrthodonticIntakeCaseId" },
            unique: true);
        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeAdvanceReceipts_DentalPracticeId_RequestId",
            table: "OrthodonticIntakeAdvanceReceipts",
            columns: new[] { "DentalPracticeId", "RequestId" },
            unique: true);
        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeAdvanceReceipts_DentalPracticeId_ReceivedAtUtc",
            table: "OrthodonticIntakeAdvanceReceipts",
            columns: new[] { "DentalPracticeId", "ReceivedAtUtc" });
        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeAdvanceReceipts_OrthodonticIntakeCaseId",
            table: "OrthodonticIntakeAdvanceReceipts",
            column: "OrthodonticIntakeCaseId");
        migrationBuilder.CreateIndex(
            name: "IX_OrthodonticIntakeAdvanceReceipts_PatientId",
            table: "OrthodonticIntakeAdvanceReceipts",
            column: "PatientId");
        migrationBuilder.Sql("""
            ALTER TABLE "OrthodonticIntakeAdvanceReceipts"
            ADD CONSTRAINT "CK_OrthodonticAdvanceReceipts_Amount"
            CHECK ("Amount" = 2500.00);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => migrationBuilder.DropTable("OrthodonticIntakeAdvanceReceipts");
}
