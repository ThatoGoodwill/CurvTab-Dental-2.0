using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditedFinancialCorrections : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InvoiceCreditNote",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreditNoteNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    IssuedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    IssuedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceCreditNote", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoiceCreditNote_Invoice_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoice",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PaymentAllocationReversal",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    AllocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    ReversedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReversedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentAllocationReversal", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentAllocationReversal_PaymentAllocation_AllocationId",
                        column: x => x.AllocationId,
                        principalTable: "PaymentAllocation",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceCreditNote_DentalPracticeId_CreditNoteNumber",
                table: "InvoiceCreditNote",
                columns: new[] { "DentalPracticeId", "CreditNoteNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceCreditNote_DentalPracticeId_InvoiceId",
                table: "InvoiceCreditNote",
                columns: new[] { "DentalPracticeId", "InvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceCreditNote_DentalPracticeId_RequestId",
                table: "InvoiceCreditNote",
                columns: new[] { "DentalPracticeId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceCreditNote_InvoiceId",
                table: "InvoiceCreditNote",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocationReversal_AllocationId",
                table: "PaymentAllocationReversal",
                column: "AllocationId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocationReversal_DentalPracticeId_AllocationId",
                table: "PaymentAllocationReversal",
                columns: new[] { "DentalPracticeId", "AllocationId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvoiceCreditNote");

            migrationBuilder.DropTable(
                name: "PaymentAllocationReversal");
        }
    }
}
