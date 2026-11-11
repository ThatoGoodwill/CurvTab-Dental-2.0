using System;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Migrations;

[DbContext(typeof(DentalDbContext))]
[Migration("20261111234000_AddOrthodonticTransferReview")]
public partial class AddOrthodonticTransferReview : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "TransferContinuationDecision", table: "OrthodonticIntakes",
            type: "character varying(32)", maxLength: 32,
            nullable: false, defaultValue: "NOT_REVIEWED");
        migrationBuilder.AddColumn<string>(
            name: "TransferDecisionReason", table: "OrthodonticIntakes",
            type: "character varying(2000)", maxLength: 2000, nullable: true);
        migrationBuilder.AddColumn<Guid>(
            name: "TransferDecidedByUserId", table: "OrthodonticIntakes",
            type: "uuid", nullable: true);
        migrationBuilder.AddColumn<DateTime>(
            name: "TransferDecidedAtUtc", table: "OrthodonticIntakes",
            type: "timestamp with time zone", nullable: true);
        migrationBuilder.Sql("""
            ALTER TABLE "OrthodonticIntakes"
            ADD CONSTRAINT "CK_OrthoTransferDecision"
            CHECK ("TransferContinuationDecision" IN
              ('NOT_REVIEWED','NEED_MORE_RECORDS','ACCEPT_CONTINUATION','DECLINE_CONTINUATION'));
            """);
    }
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            ALTER TABLE "OrthodonticIntakes"
            DROP CONSTRAINT IF EXISTS "CK_OrthoTransferDecision";
            """);
        migrationBuilder.DropColumn("TransferContinuationDecision", "OrthodonticIntakes");
        migrationBuilder.DropColumn("TransferDecisionReason", "OrthodonticIntakes");
        migrationBuilder.DropColumn("TransferDecidedByUserId", "OrthodonticIntakes");
        migrationBuilder.DropColumn("TransferDecidedAtUtc", "OrthodonticIntakes");
    }
}