using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMedicalAidInvoiceAllocationReversals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MedicalAidInvoiceAllocationReversals",
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
                    table.PrimaryKey("PK_MedicalAidInvoiceAllocationReversals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalAidInvoiceAllocationReversals_MedicalAidInvoiceAlloc~",
                        column: x => x.AllocationId,
                        principalTable: "MedicalAidInvoiceAllocations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidInvoiceAllocationReversals_AllocationId",
                table: "MedicalAidInvoiceAllocationReversals",
                column: "AllocationId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalAidInvoiceAllocationReversals_DentalPracticeId_Alloc~",
                table: "MedicalAidInvoiceAllocationReversals",
                columns: new[] { "DentalPracticeId", "AllocationId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicalAidInvoiceAllocationReversals");
        }
    }
}
