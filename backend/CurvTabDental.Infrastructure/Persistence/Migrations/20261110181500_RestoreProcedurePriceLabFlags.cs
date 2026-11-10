using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using CurvTabDental.Infrastructure.Persistence;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations;

// Non-destructive upgrade to restore existing pricing API fields.
// IF NOT EXISTS avoids data loss where lab flags were provisioned previously.
[DbContext(typeof(DentalDbContext))]
[Migration("20261110181500_RestoreProcedurePriceLabFlags")]
public sealed class RestoreProcedurePriceLabFlags : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE "ProcedurePrices"
              ADD COLUMN IF NOT EXISTS "RequiresLab" boolean NOT NULL DEFAULT false;
            ALTER TABLE "ProcedurePrices"
              ADD COLUMN IF NOT EXISTS "SupplierEstimate" numeric(12,2) NOT NULL DEFAULT 0;
            """);
    }

    // Leave existing pricing metadata intact on rollback: it may predate the migration.
    protected override void Down(MigrationBuilder migrationBuilder) { }
}
