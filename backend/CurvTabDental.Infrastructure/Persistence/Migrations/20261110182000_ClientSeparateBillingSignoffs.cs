using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using CurvTabDental.Infrastructure.Persistence;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(DentalDbContext))]
    [Migration("20261110182000_ClientSeparateBillingSignoffs")]
    public sealed class ClientSeparateBillingSignoffs : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CashDayCloseSubmissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type:"uuid",nullable:false),
                    DentalPracticeId = table.Column<Guid>(type:"uuid",nullable:false),
                    BusinessDate = table.Column<DateOnly>(type:"date",nullable:false),
                    OpeningFloat = table.Column<decimal>(type:"numeric(12,2)",nullable:false),
                    CountedCash = table.Column<decimal>(type:"numeric(12,2)",nullable:false),
                    CashReceived = table.Column<decimal>(type:"numeric(12,2)",nullable:false),
                    CashExpenses = table.Column<decimal>(type:"numeric(12,2)",nullable:false),
                    ExpectedCash = table.Column<decimal>(type:"numeric(12,2)",nullable:false),
                    Variance = table.Column<decimal>(type:"numeric(12,2)",nullable:false),
                    Explanation = table.Column<string>(type:"character varying(1000)",maxLength:1000,nullable:true),
                    EvidenceReference = table.Column<string>(type:"character varying(300)",maxLength:300,nullable:true),
                    SubmittedByUserId = table.Column<Guid>(type:"uuid",nullable:false),
                    SubmittedAtUtc = table.Column<DateTime>(type:"timestamp with time zone",nullable:false)
                },
                constraints: table => table.PrimaryKey("PK_CashDayCloseSubmissions",x=>x.Id));
            migrationBuilder.CreateIndex(
                name:"IX_CashDayCloseSubmissions_Practice_Date",
                table:"CashDayCloseSubmissions",
                columns:new[]{"DentalPracticeId","BusinessDate"},unique:true);

            migrationBuilder.CreateTable(
                name: "CashDayCloseReviews",
                columns: table => new
                {
                    Id = table.Column<Guid>(type:"uuid",nullable:false),
                    DentalPracticeId = table.Column<Guid>(type:"uuid",nullable:false),
                    SubmissionId = table.Column<Guid>(type:"uuid",nullable:false),
                    RequestId = table.Column<Guid>(type:"uuid",nullable:false),
                    Decision = table.Column<string>(type:"character varying(20)",maxLength:20,nullable:false),
                    Reason = table.Column<string>(type:"character varying(1000)",maxLength:1000,nullable:false),
                    ReviewedByUserId = table.Column<Guid>(type:"uuid",nullable:false),
                    ReviewedAtUtc = table.Column<DateTime>(type:"timestamp with time zone",nullable:false)
                },
                constraints: table => table.PrimaryKey("PK_CashDayCloseReviews",x=>x.Id));
            migrationBuilder.CreateIndex(
                name:"IX_CashDayCloseReviews_Practice_Request",
                table:"CashDayCloseReviews",
                columns:new[]{"DentalPracticeId","RequestId"},unique:true);
            migrationBuilder.CreateIndex(
                name:"IX_CashDayCloseReviews_Practice_Submission",
                table:"CashDayCloseReviews",
                columns:new[]{"DentalPracticeId","SubmissionId","ReviewedAtUtc"});

            migrationBuilder.CreateTable(
                name:"MedicalAidDaySignoffs",
                columns:table=>new
                {
                    Id=table.Column<Guid>(type:"uuid",nullable:false),
                    DentalPracticeId=table.Column<Guid>(type:"uuid",nullable:false),
                    BusinessDate=table.Column<DateOnly>(type:"date",nullable:false),
                    PatientsTreated=table.Column<int>(type:"integer",nullable:false),
                    UniqueClaims=table.Column<int>(type:"integer",nullable:false),
                    SubmissionAttempts=table.Column<int>(type:"integer",nullable:false),
                    SubmittedValue=table.Column<decimal>(type:"numeric(12,2)",nullable:false),
                    ActionsPending=table.Column<int>(type:"integer",nullable:false),
                    SnapshotJson=table.Column<string>(type:"text",nullable:false),
                    SignedByUserId=table.Column<Guid>(type:"uuid",nullable:false),
                    SignedAtUtc=table.Column<DateTime>(type:"timestamp with time zone",nullable:false)
                },
                constraints:table=>table.PrimaryKey("PK_MedicalAidDaySignoffs",x=>x.Id));
            migrationBuilder.CreateIndex(
                name:"IX_MedicalAidDaySignoffs_Practice_Date",
                table:"MedicalAidDaySignoffs",
                columns:new[]{"DentalPracticeId","BusinessDate"},unique:true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name:"CashDayCloseReviews");
            migrationBuilder.DropTable(name:"CashDayCloseSubmissions");
            migrationBuilder.DropTable(name:"MedicalAidDaySignoffs");
        }
    }
}
