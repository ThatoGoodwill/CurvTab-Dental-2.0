using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddPracticeExpensesAndCashSignoff : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CashDaySignoff",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    BusinessDate = table.Column<DateOnly>(type: "date", nullable: false),
                    OpeningFloat = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    CashReceived = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    CashExpenses = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    ExpectedCash = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    CountedCash = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    Variance = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    CashReceiptCount = table.Column<int>(type: "integer", nullable: false),
                    CashExpenseCount = table.Column<int>(type: "integer", nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    SignedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SignedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CashDaySignoff", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PracticeExpense",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpenseDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Category = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Description = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: false),
                    Method = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Reference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Amount = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    RecordedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PracticeExpense", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CashDaySignoff_DentalPracticeId_BusinessDate",
                table: "CashDaySignoff",
                columns: new[] { "DentalPracticeId", "BusinessDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PracticeExpense_DentalPracticeId_ExpenseDate",
                table: "PracticeExpense",
                columns: new[] { "DentalPracticeId", "ExpenseDate" });

            migrationBuilder.CreateIndex(
                name: "IX_PracticeExpense_DentalPracticeId_RequestId",
                table: "PracticeExpense",
                columns: new[] { "DentalPracticeId", "RequestId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CashDaySignoff");

            migrationBuilder.DropTable(
                name: "PracticeExpense");
        }
    }
}
