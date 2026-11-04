using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddOrthodonticInvoiceSources : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "SourceConsultationChargeId",
                table: "InvoiceLine",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "SourceOrthodonticFinancialAgreementId",
                table: "InvoiceLine",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "ConsultationId",
                table: "Invoice",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AlterColumn<Guid>(
                name: "AppointmentId",
                table: "Invoice",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "OrthodonticFinancialAgreementId",
                table: "Invoice",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLine_DentalPracticeId_SourceOrthodonticFinancialAgre~",
                table: "InvoiceLine",
                columns: new[] { "DentalPracticeId", "SourceOrthodonticFinancialAgreementId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLine_SourceOrthodonticFinancialAgreementId",
                table: "InvoiceLine",
                column: "SourceOrthodonticFinancialAgreementId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_InvoiceLine_ExactlyOneSource",
                table: "InvoiceLine",
                sql: "(\n  \"SourceConsultationChargeId\" IS NOT NULL\n  AND \"SourceOrthodonticFinancialAgreementId\" IS NULL\n)\nOR\n(\n  \"SourceConsultationChargeId\" IS NULL\n  AND \"SourceOrthodonticFinancialAgreementId\" IS NOT NULL\n)");

            migrationBuilder.CreateIndex(
                name: "IX_Invoice_DentalPracticeId_OrthodonticFinancialAgreementId",
                table: "Invoice",
                columns: new[] { "DentalPracticeId", "OrthodonticFinancialAgreementId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Invoice_OrthodonticFinancialAgreementId",
                table: "Invoice",
                column: "OrthodonticFinancialAgreementId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Invoice_ExactlyOneSource",
                table: "Invoice",
                sql: "(\n  \"ConsultationId\" IS NOT NULL\n  AND \"AppointmentId\" IS NOT NULL\n  AND \"OrthodonticFinancialAgreementId\" IS NULL\n)\nOR\n(\n  \"ConsultationId\" IS NULL\n  AND \"AppointmentId\" IS NULL\n  AND \"OrthodonticFinancialAgreementId\" IS NOT NULL\n)");

            migrationBuilder.AddForeignKey(
                name: "FK_Invoice_OrthodonticFinancialAgreements_OrthodonticFinancial~",
                table: "Invoice",
                column: "OrthodonticFinancialAgreementId",
                principalTable: "OrthodonticFinancialAgreements",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_InvoiceLine_OrthodonticFinancialAgreements_SourceOrthodonti~",
                table: "InvoiceLine",
                column: "SourceOrthodonticFinancialAgreementId",
                principalTable: "OrthodonticFinancialAgreements",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Invoice_OrthodonticFinancialAgreements_OrthodonticFinancial~",
                table: "Invoice");

            migrationBuilder.DropForeignKey(
                name: "FK_InvoiceLine_OrthodonticFinancialAgreements_SourceOrthodonti~",
                table: "InvoiceLine");

            migrationBuilder.DropIndex(
                name: "IX_InvoiceLine_DentalPracticeId_SourceOrthodonticFinancialAgre~",
                table: "InvoiceLine");

            migrationBuilder.DropIndex(
                name: "IX_InvoiceLine_SourceOrthodonticFinancialAgreementId",
                table: "InvoiceLine");

            migrationBuilder.DropCheckConstraint(
                name: "CK_InvoiceLine_ExactlyOneSource",
                table: "InvoiceLine");

            migrationBuilder.DropIndex(
                name: "IX_Invoice_DentalPracticeId_OrthodonticFinancialAgreementId",
                table: "Invoice");

            migrationBuilder.DropIndex(
                name: "IX_Invoice_OrthodonticFinancialAgreementId",
                table: "Invoice");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Invoice_ExactlyOneSource",
                table: "Invoice");

            migrationBuilder.DropColumn(
                name: "SourceOrthodonticFinancialAgreementId",
                table: "InvoiceLine");

            migrationBuilder.DropColumn(
                name: "OrthodonticFinancialAgreementId",
                table: "Invoice");

            migrationBuilder.AlterColumn<Guid>(
                name: "SourceConsultationChargeId",
                table: "InvoiceLine",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "ConsultationId",
                table: "Invoice",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "AppointmentId",
                table: "Invoice",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
