using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CurvTabDental.Infrastructure.Migrations;

// Add missing procedure-to-laboratory flags required by the existing pricing API.
// Existing records remain intact; no change to their prices or historical charges.
[DbContext(typeof(DentalDbContext))]
[Migration("20261110170000_RepairProcedureLabPricing")]
public sealed class RepairProcedureLabPricing : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "RequiresLab", table: "ProcedurePrices",
            type: "boolean", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<decimal>(
            name: "SupplierEstimate", table: "ProcedurePrices",
            type: "numeric(12,2)", nullable: false, defaultValue: 0m);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "SupplierEstimate", table: "ProcedurePrices");
        migrationBuilder.DropColumn(name: "RequiresLab", table: "ProcedurePrices");
    }
}
