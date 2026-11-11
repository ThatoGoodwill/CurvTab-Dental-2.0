using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using CurvTabDental.Infrastructure.Persistence;

#nullable disable

namespace CurvTabDental.Infrastructure.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261111151000_EmployeeWorkspaceRecords")]
public partial class EmployeeWorkspaceRecords : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "EmployeeWorkspaceRecords",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                EmployeeUserId = table.Column<Guid>(type: "uuid", nullable: false),
                RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                Category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                Title = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: true),
                DocumentReference = table.Column<string>(type: "character varying(350)", maxLength: 350, nullable: true),
                Notes = table.Column<string>(type: "character varying(1200)", maxLength: 1200, nullable: true),
                CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_EmployeeWorkspaceRecords", x => x.Id);
                table.ForeignKey("FK_EmployeeWorkspaceRecords_AspNetUsers_EmployeeUserId",
                    x => x.EmployeeUserId, "AspNetUsers", "Id", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex("IX_EmployeeWorkspaceRecords_EmployeeUserId",
            "EmployeeWorkspaceRecords", "EmployeeUserId");
        migrationBuilder.CreateIndex("IX_EmployeeWorkspaceRecords_DentalPracticeId_RequestId",
            "EmployeeWorkspaceRecords", new[] { "DentalPracticeId", "RequestId" }, unique: true);
        migrationBuilder.CreateIndex("IX_EmployeeWorkspaceRecords_DentalPracticeId_EmployeeUserId_Category_CreatedAtUtc",
            "EmployeeWorkspaceRecords", new[] { "DentalPracticeId", "EmployeeUserId", "Category", "CreatedAtUtc" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("EmployeeWorkspaceRecords");
    }
}
