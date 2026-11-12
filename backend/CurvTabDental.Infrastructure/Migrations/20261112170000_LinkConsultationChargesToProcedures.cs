using System;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Migrations;

// Additive, nullable link: historical charges are preserved unchanged.
// One planned procedure can be billed on at most one clinical consultation.
[DbContext(typeof(DentalDbContext))]
[Migration("20261112170000_LinkConsultationChargesToProcedures")]
public sealed class LinkConsultationChargesToProcedures : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "TreatmentProcedureId",
            table: "ConsultationCharges",
            type: "uuid",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "IX_ConsultationCharges_DentalPracticeId_TreatmentProcedureId",
            table: "ConsultationCharges",
            columns: new[] { "DentalPracticeId", "TreatmentProcedureId" },
            unique: true,
            filter: "\"TreatmentProcedureId\" IS NOT NULL");

        migrationBuilder.AddForeignKey(
            name: "FK_ConsultationCharges_PatientTreatmentProcedures_TreatmentProcedureId",
            table: "ConsultationCharges",
            column: "TreatmentProcedureId",
            principalTable: "PatientTreatmentProcedures",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_ConsultationCharges_PatientTreatmentProcedures_TreatmentProcedureId",
            table: "ConsultationCharges");
        migrationBuilder.DropIndex(
            name: "IX_ConsultationCharges_DentalPracticeId_TreatmentProcedureId",
            table: "ConsultationCharges");
        migrationBuilder.DropColumn(name: "TreatmentProcedureId", table: "ConsultationCharges");
    }
}
