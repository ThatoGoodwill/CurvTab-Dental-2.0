using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace CurvTabDental.Infrastructure.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261113083000_AddClinicalIssuedDocuments")]
public sealed class AddClinicalIssuedDocuments : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "ClinicalPrescriptions" (
              "Id" uuid NOT NULL PRIMARY KEY,
              "DentalPracticeId" uuid NOT NULL, "PatientId" uuid NOT NULL,
              "ConsultationId" uuid NOT NULL, "DentistUserId" uuid NOT NULL,
              "RequestId" uuid NOT NULL,
              "Medication" varchar(200) NOT NULL, "Dose" varchar(200) NOT NULL,
              "Route" varchar(120) NOT NULL, "Frequency" varchar(200) NOT NULL,
              "Duration" varchar(200) NOT NULL, "Quantity" varchar(200) NOT NULL,
              "Directions" varchar(2000) NOT NULL, "ClinicalRationale" varchar(3000) NOT NULL,
              "MedicalHistoryReviewed" boolean NOT NULL,
              "IssuedAtUtc" timestamptz NOT NULL DEFAULT now()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_ClinicalPrescriptions_DentalPracticeId_RequestId"
              ON "ClinicalPrescriptions" ("DentalPracticeId", "RequestId");
            CREATE INDEX IF NOT EXISTS "IX_ClinicalPrescriptions_DentalPracticeId_PatientId_ConsultationId"
              ON "ClinicalPrescriptions" ("DentalPracticeId", "PatientId", "ConsultationId");

            CREATE TABLE IF NOT EXISTS "PatientMedicalCertificates" (
              "Id" uuid NOT NULL PRIMARY KEY,
              "DentalPracticeId" uuid NOT NULL, "PatientId" uuid NOT NULL,
              "ConsultationId" uuid NOT NULL, "DentistUserId" uuid NOT NULL,
              "RequestId" uuid NOT NULL,
              "FromDate" date NOT NULL, "ToDate" date NOT NULL,
              "ClinicalJustification" varchar(3000) NOT NULL,
              "WorkAdvice" varchar(2000) NOT NULL,
              "IssuedAtUtc" timestamptz NOT NULL DEFAULT now()
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PatientMedicalCertificates_DentalPracticeId_RequestId"
              ON "PatientMedicalCertificates" ("DentalPracticeId", "RequestId");
            CREATE INDEX IF NOT EXISTS "IX_PatientMedicalCertificates_DentalPracticeId_PatientId_ConsultationId"
              ON "PatientMedicalCertificates" ("DentalPracticeId", "PatientId", "ConsultationId");
        """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        throw new InvalidOperationException("Issued clinical documents are append-only and cannot be dropped automatically.");
    }
}
