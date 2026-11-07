using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMedicalAidRemittanceMatching : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MedicalAidRemittanceMatches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    BankReceiptId = table.Column<Guid>(type: "uuid", nullable: false),
                    RemittanceAdviceId = table.Column<Guid>(type: "uuid", nullable: false),
                    MatchedAmount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    MatchedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    MatchedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicalAidRemittanceMatches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalAidRemittanceMatches_MedicalAidBankReceipts_BankRece~",
                        column: x => x.BankReceiptId,
                        principalTable: "MedicalAidBankReceipts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MedicalAidRemittanceMatches_MedicalAidRemittanceAdvices_Rem~",
                        column: x => x.RemittanceAdviceId,
                        principalTable: "MedicalAidRemittanceAdvices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidRemittanceMatches_BankReceiptId",
                table: "MedicalAidRemittanceMatches",
                column: "BankReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidRemittanceMatches_DentalPracticeId_BankReceiptId_~",
                table: "MedicalAidRemittanceMatches",
                columns: new[] { "DentalPracticeId", "BankReceiptId", "RemittanceAdviceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidRemittanceMatches_DentalPracticeId_RemittanceAdvi~",
                table: "MedicalAidRemittanceMatches",
                columns: new[] { "DentalPracticeId", "RemittanceAdviceId" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidRemittanceMatches_DentalPracticeId_RequestId",
                table: "MedicalAidRemittanceMatches",
                columns: new[] { "DentalPracticeId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidRemittanceMatches_RemittanceAdviceId",
                table: "MedicalAidRemittanceMatches",
                column: "RemittanceAdviceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicalAidRemittanceMatches");
        }
    }
}
