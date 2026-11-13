using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace CurvTabDental.Infrastructure.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261113140000_ClinicalAuthorizedDocuments")]
public sealed class ClinicalAuthorizedDocuments : Migration
{
    protected override void Up(MigrationBuilder builder)
    {
        builder.Sql("""
            CREATE TABLE "ClinicalPrescriptions" (
              "Id" uuid PRIMARY KEY,
              "DentalPracticeId" uuid NOT NULL,
              "PatientId" uuid NOT NULL REFERENCES "Patients"("Id") ON DELETE RESTRICT,
              "ConsultationId" uuid NOT NULL REFERENCES "Consultations"("Id") ON DELETE RESTRICT,
              "AppointmentId" uuid NOT NULL REFERENCES "Appointments"("Id") ON DELETE RESTRICT,
              "PrescriberUserId" uuid NOT NULL,
              "PractitionerName" varchar(200) NOT NULL,
              "PractitionerRegistrationNumber" varchar(60) NOT NULL,
              "MedicationName" varchar(200) NOT NULL,
              "Strength" varchar(100) NOT NULL,
              "Dosage" varchar(300) NOT NULL,
              "Route" varchar(100) NOT NULL,
              "Frequency" varchar(200) NOT NULL,
              "Duration" varchar(200) NOT NULL,
              "Quantity" varchar(100) NOT NULL,
              "Instructions" varchar(2000) NOT NULL,
              "ClinicalIndication" varchar(2000) NOT NULL,
              "AuthorizedAtUtc" timestamptz NOT NULL DEFAULT now()
            );
            CREATE INDEX "IX_ClinicalPrescriptions_PatientId" ON "ClinicalPrescriptions" ("PatientId");
            CREATE INDEX "IX_ClinicalPrescriptions_ConsultationId" ON "ClinicalPrescriptions" ("ConsultationId");
            CREATE INDEX "IX_ClinicalPrescriptions_AppointmentId" ON "ClinicalPrescriptions" ("AppointmentId");
            CREATE INDEX "IX_ClinicalPrescriptions_DentalPracticeId_PatientId_AuthorizedAtUtc"
              ON "ClinicalPrescriptions" ("DentalPracticeId", "PatientId", "AuthorizedAtUtc");

            CREATE TABLE "ClinicalMedicalCertificates" (
              "Id" uuid PRIMARY KEY,
              "DentalPracticeId" uuid NOT NULL,
              "PatientId" uuid NOT NULL REFERENCES "Patients"("Id") ON DELETE RESTRICT,
              "ConsultationId" uuid NOT NULL REFERENCES "Consultations"("Id") ON DELETE RESTRICT,
              "AppointmentId" uuid NOT NULL REFERENCES "Appointments"("Id") ON DELETE RESTRICT,
              "PractitionerUserId" uuid NOT NULL,
              "PractitionerName" varchar(200) NOT NULL,
              "PractitionerRegistrationNumber" varchar(60) NOT NULL,
              "FromDate" date NOT NULL,
              "ThroughDate" date NOT NULL,
              "WorkCapacityStatement" varchar(1000) NOT NULL,
              "ClinicalJustification" varchar(4000) NOT NULL,
              "PatientOrRepresentativeName" varchar(200) NOT NULL,
              "AuthorizedAtUtc" timestamptz NOT NULL DEFAULT now(),
              CONSTRAINT "CK_ClinicalMedicalCertificates_Dates" CHECK ("FromDate" <= "ThroughDate")
            );
            CREATE INDEX "IX_ClinicalMedicalCertificates_PatientId" ON "ClinicalMedicalCertificates" ("PatientId");
            CREATE INDEX "IX_ClinicalMedicalCertificates_ConsultationId" ON "ClinicalMedicalCertificates" ("ConsultationId");
            CREATE INDEX "IX_ClinicalMedicalCertificates_AppointmentId" ON "ClinicalMedicalCertificates" ("AppointmentId");
            CREATE INDEX "IX_ClinicalMedicalCertificates_DentalPracticeId_PatientId_AuthorizedAtUtc"
              ON "ClinicalMedicalCertificates" ("DentalPracticeId", "PatientId", "AuthorizedAtUtc");
            """);
    }
    protected override void Down(MigrationBuilder builder)
    {
        builder.Sql("""
            DROP TABLE "ClinicalMedicalCertificates";
            DROP TABLE "ClinicalPrescriptions";
            """);
    }
}
