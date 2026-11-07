using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMedicalAidInvoiceAllocations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MedicalAidInvoiceAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    RemittanceMatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    AllocatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AllocatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicalAidInvoiceAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalAidInvoiceAllocations_Invoice_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoice",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MedicalAidInvoiceAllocations_MedicalAidRemittanceMatches_Re~",
                        column: x => x.RemittanceMatchId,
                        principalTable: "MedicalAidRemittanceMatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidInvoiceAllocations_DentalPracticeId_InvoiceId",
                table: "MedicalAidInvoiceAllocations",
                columns: new[] { "DentalPracticeId", "InvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidInvoiceAllocations_DentalPracticeId_RemittanceMat~",
                table: "MedicalAidInvoiceAllocations",
                columns: new[] { "DentalPracticeId", "RemittanceMatchId" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidInvoiceAllocations_DentalPracticeId_RequestId",
                table: "MedicalAidInvoiceAllocations",
                columns: new[] { "DentalPracticeId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidInvoiceAllocations_InvoiceId",
                table: "MedicalAidInvoiceAllocations",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidInvoiceAllocations_RemittanceMatchId",
                table: "MedicalAidInvoiceAllocations",
                column: "RemittanceMatchId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicalAidInvoiceAllocations");
        }
    }
}
