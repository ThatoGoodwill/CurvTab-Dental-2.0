using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMedicalAidBankReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MedicalAidBankReceipts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    SchemeName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    SchemeKey = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    BankReference = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    BankReferenceKey = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    ReceivedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    RecordedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicalAidBankReceipts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalAidBankReceipts_DentalPractices_DentalPracticeId",
                        column: x => x.DentalPracticeId,
                        principalTable: "DentalPractices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidBankReceipts_DentalPracticeId_RequestId",
                table: "MedicalAidBankReceipts",
                columns: new[] { "DentalPracticeId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidBankReceipts_DentalPracticeId_SchemeKey_BankRefer~",
                table: "MedicalAidBankReceipts",
                columns: new[] { "DentalPracticeId", "SchemeKey", "BankReferenceKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicalAidBankReceipts");
        }
    }
}
