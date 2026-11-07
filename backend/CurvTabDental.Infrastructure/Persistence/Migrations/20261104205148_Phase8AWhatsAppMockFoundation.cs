using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase8AWhatsAppMockFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WhatsAppConsents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Channel = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Source = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    GrantedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RevokedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WhatsAppConsents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WhatsAppConsents_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "WhatsAppOutboundMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    AppointmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    TemplateKey = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    AppointmentStartUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WhatsAppOutboundMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WhatsAppOutboundMessages_Appointments_AppointmentId",
                        column: x => x.AppointmentId,
                        principalTable: "Appointments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WhatsAppOutboundMessages_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WhatsAppConsents_DentalPracticeId_PatientId",
                table: "WhatsAppConsents",
                columns: new[] { "DentalPracticeId", "PatientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WhatsAppConsents_PatientId",
                table: "WhatsAppConsents",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_WhatsAppOutboundMessages_AppointmentId",
                table: "WhatsAppOutboundMessages",
                column: "AppointmentId");

            migrationBuilder.CreateIndex(
                name: "IX_WhatsAppOutboundMessages_DentalPracticeId_AppointmentId_Tem~",
                table: "WhatsAppOutboundMessages",
                columns: new[] { "DentalPracticeId", "AppointmentId", "TemplateKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WhatsAppOutboundMessages_DentalPracticeId_CreatedAtUtc",
                table: "WhatsAppOutboundMessages",
                columns: new[] { "DentalPracticeId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_WhatsAppOutboundMessages_PatientId",
                table: "WhatsAppOutboundMessages",
                column: "PatientId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WhatsAppConsents");

            migrationBuilder.DropTable(
                name: "WhatsAppOutboundMessages");
        }
    }
}
