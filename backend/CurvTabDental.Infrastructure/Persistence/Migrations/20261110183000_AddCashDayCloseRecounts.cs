using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using CurvTabDental.Infrastructure.Persistence;
#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261110183000_AddCashDayCloseRecounts")]
public sealed class AddCashDayCloseRecounts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name:"CashDayCloseAdjustments",
            columns:table=>new
            {
                Id=table.Column<Guid>(type:"uuid",nullable:false),
                DentalPracticeId=table.Column<Guid>(type:"uuid",nullable:false),
                SubmissionId=table.Column<Guid>(type:"uuid",nullable:false),
                RequestId=table.Column<Guid>(type:"uuid",nullable:false),
                RevisedCountedCash=table.Column<decimal>(type:"numeric(12,2)",nullable:false),
                Reason=table.Column<string>(type:"character varying(1000)",maxLength:1000,nullable:false),
                EvidenceReference=table.Column<string>(type:"character varying(300)",maxLength:300,nullable:false),
                RecordedByUserId=table.Column<Guid>(type:"uuid",nullable:false),
                RecordedAtUtc=table.Column<DateTime>(type:"timestamp with time zone",nullable:false)
            },
            constraints:table=>table.PrimaryKey("PK_CashDayCloseAdjustments",x=>x.Id));
        migrationBuilder.CreateIndex(name:"IX_CashAdjustments_Practice_Request",
            table:"CashDayCloseAdjustments",columns:new[]{"DentalPracticeId","RequestId"},unique:true);
        migrationBuilder.CreateIndex(name:"IX_CashAdjustments_Practice_Submission",
            table:"CashDayCloseAdjustments",columns:new[]{"DentalPracticeId","SubmissionId","RecordedAtUtc"});
        migrationBuilder.AddForeignKey(name:"FK_CashDayCloseAdjustments_Submission",
            table:"CashDayCloseAdjustments",column:"SubmissionId",principalTable:"CashDayCloseSubmissions",
            principalColumn:"Id",onDelete:ReferentialAction.Restrict);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name:"CashDayCloseAdjustments");
    }
}
