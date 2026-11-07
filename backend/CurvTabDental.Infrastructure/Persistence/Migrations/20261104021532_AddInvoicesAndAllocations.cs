using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoicesAndAllocations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Invoice",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    AppointmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    TotalAmount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    IssuedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    IssuedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Invoice", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Invoice_Appointments_AppointmentId",
                        column: x => x.AppointmentId,
                        principalTable: "Appointments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Invoice_Consultations_ConsultationId",
                        column: x => x.ConsultationId,
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Invoice_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InvoiceLine",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceConsultationChargeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceLine", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoiceLine_ConsultationCharges_SourceConsultationChargeId",
                        column: x => x.SourceConsultationChargeId,
                        principalTable: "ConsultationCharges",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InvoiceLine_Invoice_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoice",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PaymentAllocation",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    AllocatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AllocatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentAllocation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentAllocation_Invoice_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoice",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PaymentAllocation_Payments_PaymentId",
                        column: x => x.PaymentId,
                        principalTable: "Payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Invoice_AppointmentId",
                table: "Invoice",
                column: "AppointmentId");

            migrationBuilder.CreateIndex(
                name: "IX_Invoice_ConsultationId",
                table: "Invoice",
                column: "ConsultationId");

            migrationBuilder.CreateIndex(
                name: "IX_Invoice_DentalPracticeId_ConsultationId",
                table: "Invoice",
                columns: new[] { "DentalPracticeId", "ConsultationId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Invoice_DentalPracticeId_InvoiceNumber",
                table: "Invoice",
                columns: new[] { "DentalPracticeId", "InvoiceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Invoice_DentalPracticeId_PatientId",
                table: "Invoice",
                columns: new[] { "DentalPracticeId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Invoice_PatientId",
                table: "Invoice",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLine_DentalPracticeId_InvoiceId",
                table: "InvoiceLine",
                columns: new[] { "DentalPracticeId", "InvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLine_DentalPracticeId_SourceConsultationChargeId",
                table: "InvoiceLine",
                columns: new[] { "DentalPracticeId", "SourceConsultationChargeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLine_InvoiceId",
                table: "InvoiceLine",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLine_SourceConsultationChargeId",
                table: "InvoiceLine",
                column: "SourceConsultationChargeId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocation_DentalPracticeId_InvoiceId",
                table: "PaymentAllocation",
                columns: new[] { "DentalPracticeId", "InvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocation_DentalPracticeId_InvoiceId_PaymentId",
                table: "PaymentAllocation",
                columns: new[] { "DentalPracticeId", "InvoiceId", "PaymentId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocation_DentalPracticeId_PaymentId",
                table: "PaymentAllocation",
                columns: new[] { "DentalPracticeId", "PaymentId" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocation_InvoiceId",
                table: "PaymentAllocation",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAllocation_PaymentId",
                table: "PaymentAllocation",
                column: "PaymentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvoiceLine");

            migrationBuilder.DropTable(
                name: "PaymentAllocation");

            migrationBuilder.DropTable(
                name: "Invoice");
        }
    }
}
