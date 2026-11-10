using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using CurvTabDental.Infrastructure.Persistence;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261110182500_AddClaimSubmissionAttemptSnapshots")]
public sealed class AddClaimSubmissionAttemptSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Non-destructive: earlier claim events remain unchanged.
        migrationBuilder.Sql("""
            ALTER TABLE "MedicalAidClaimEvents"
              ADD COLUMN IF NOT EXISTS "AttemptNumber" integer NULL;
            ALTER TABLE "MedicalAidClaimEvents"
              ADD COLUMN IF NOT EXISTS "PayloadSnapshotJson" text NULL;
            """);
    }

    // Keep append-only clinical/claim evidence on downgrade.
    protected override void Down(MigrationBuilder migrationBuilder) { }
}
