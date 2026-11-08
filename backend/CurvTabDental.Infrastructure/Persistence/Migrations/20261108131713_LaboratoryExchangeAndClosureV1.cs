using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LaboratoryExchangeAndClosureV1 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LaboratoryActivities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    LaboratoryManifestId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(65)", maxLength: 65, nullable: false),
                    Details = table.Column<string>(type: "character varying(3000)", maxLength: 3000, nullable: true),
                    AtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LaboratoryActivities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LaboratoryPartners",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Contact = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    Phone = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LaboratoryPartners", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LaboratoryManifests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryPartnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reference = table.Column<string>(type: "character varying(70)", maxLength: 70, nullable: false),
                    Direction = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    PackageCount = table.Column<int>(type: "integer", nullable: false),
                    CollectorName = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: true),
                    ReceiverName = table.Column<string>(type: "character varying(140)", maxLength: 140, nullable: true),
                    Waybill = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    Acknowledgement = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Discrepancy = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    PreparedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    HandedOverAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReceivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LaboratoryManifests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LaboratoryManifests_LaboratoryPartners_LaboratoryPartnerId",
                        column: x => x.LaboratoryPartnerId,
                        principalTable: "LaboratoryPartners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LaboratoryMemberships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryPartnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LaboratoryMemberships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LaboratoryMemberships_LaboratoryPartners_LaboratoryPartnerId",
                        column: x => x.LaboratoryPartnerId,
                        principalTable: "LaboratoryPartners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LaboratoryOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryPartnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    TreatmentPlanId = table.Column<Guid>(type: "uuid", nullable: true),
                    Reference = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Instructions = table.Column<string>(type: "character varying(5000)", maxLength: 5000, nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PrescribedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClosedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LaboratoryOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LaboratoryOrders_LaboratoryPartners_LaboratoryPartnerId",
                        column: x => x.LaboratoryPartnerId,
                        principalTable: "LaboratoryPartners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LaboratoryOrders_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LaboratoryItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActiveManifestId = table.Column<Guid>(type: "uuid", nullable: true),
                    ToothCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Procedure = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                    IsRemovable = table.Column<bool>(type: "boolean", nullable: false),
                    ManufacturingStatus = table.Column<string>(type: "character varying(36)", maxLength: 36, nullable: false),
                    CustodyStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    QaStatus = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    ClinicalStatus = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    ExpectedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PatientHandedOverAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    GuaranteeNote = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CorrectionCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LaboratoryItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LaboratoryItems_LaboratoryOrders_LaboratoryOrderId",
                        column: x => x.LaboratoryOrderId,
                        principalTable: "LaboratoryOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LaboratoryCorrections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Reason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Instructions = table.Column<string>(type: "character varying(3000)", maxLength: 3000, nullable: false),
                    Priority = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    DueAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RequestedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ResolvedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LaboratoryCorrections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LaboratoryCorrections_LaboratoryItems_LaboratoryItemId",
                        column: x => x.LaboratoryItemId,
                        principalTable: "LaboratoryItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LaboratoryEvidence",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    UploadedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(90)", maxLength: 90, nullable: false),
                    Bytes = table.Column<byte[]>(type: "bytea", nullable: false),
                    UploadedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LaboratoryEvidence", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LaboratoryEvidence_LaboratoryItems_LaboratoryItemId",
                        column: x => x.LaboratoryItemId,
                        principalTable: "LaboratoryItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LaboratoryManifestLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DentalPracticeId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryManifestId = table.Column<Guid>(type: "uuid", nullable: false),
                    LaboratoryItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LaboratoryManifestLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LaboratoryManifestLines_LaboratoryItems_LaboratoryItemId",
                        column: x => x.LaboratoryItemId,
                        principalTable: "LaboratoryItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_LaboratoryManifestLines_LaboratoryManifests_LaboratoryManif~",
                        column: x => x.LaboratoryManifestId,
                        principalTable: "LaboratoryManifests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryActivities_DentalPracticeId_LaboratoryOrderId_AtU~",
                table: "LaboratoryActivities",
                columns: new[] { "DentalPracticeId", "LaboratoryOrderId", "AtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryCorrections_DentalPracticeId_LaboratoryItemId",
                table: "LaboratoryCorrections",
                columns: new[] { "DentalPracticeId", "LaboratoryItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryCorrections_LaboratoryItemId",
                table: "LaboratoryCorrections",
                column: "LaboratoryItemId");

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryEvidence_DentalPracticeId_LaboratoryItemId",
                table: "LaboratoryEvidence",
                columns: new[] { "DentalPracticeId", "LaboratoryItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryEvidence_LaboratoryItemId",
                table: "LaboratoryEvidence",
                column: "LaboratoryItemId");

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryItems_DentalPracticeId_LaboratoryOrderId",
                table: "LaboratoryItems",
                columns: new[] { "DentalPracticeId", "LaboratoryOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryItems_LaboratoryOrderId",
                table: "LaboratoryItems",
                column: "LaboratoryOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryManifestLines_DentalPracticeId_LaboratoryManifest~",
                table: "LaboratoryManifestLines",
                columns: new[] { "DentalPracticeId", "LaboratoryManifestId", "LaboratoryItemId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryManifestLines_LaboratoryItemId",
                table: "LaboratoryManifestLines",
                column: "LaboratoryItemId");

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryManifestLines_LaboratoryManifestId",
                table: "LaboratoryManifestLines",
                column: "LaboratoryManifestId");

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryManifests_DentalPracticeId_LaboratoryPartnerId_Pr~",
                table: "LaboratoryManifests",
                columns: new[] { "DentalPracticeId", "LaboratoryPartnerId", "PreparedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryManifests_DentalPracticeId_Reference",
                table: "LaboratoryManifests",
                columns: new[] { "DentalPracticeId", "Reference" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryManifests_LaboratoryPartnerId",
                table: "LaboratoryManifests",
                column: "LaboratoryPartnerId");

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryMemberships_DentalPracticeId_LaboratoryPartnerId_~",
                table: "LaboratoryMemberships",
                columns: new[] { "DentalPracticeId", "LaboratoryPartnerId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryMemberships_LaboratoryPartnerId",
                table: "LaboratoryMemberships",
                column: "LaboratoryPartnerId");

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryOrders_DentalPracticeId_PatientId",
                table: "LaboratoryOrders",
                columns: new[] { "DentalPracticeId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryOrders_DentalPracticeId_Reference",
                table: "LaboratoryOrders",
                columns: new[] { "DentalPracticeId", "Reference" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryOrders_LaboratoryPartnerId",
                table: "LaboratoryOrders",
                column: "LaboratoryPartnerId");

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryOrders_PatientId",
                table: "LaboratoryOrders",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_LaboratoryPartners_DentalPracticeId_Name",
                table: "LaboratoryPartners",
                columns: new[] { "DentalPracticeId", "Name" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LaboratoryActivities");

            migrationBuilder.DropTable(
                name: "LaboratoryCorrections");

            migrationBuilder.DropTable(
                name: "LaboratoryEvidence");

            migrationBuilder.DropTable(
                name: "LaboratoryManifestLines");

            migrationBuilder.DropTable(
                name: "LaboratoryMemberships");

            migrationBuilder.DropTable(
                name: "LaboratoryItems");

            migrationBuilder.DropTable(
                name: "LaboratoryManifests");

            migrationBuilder.DropTable(
                name: "LaboratoryOrders");

            migrationBuilder.DropTable(
                name: "LaboratoryPartners");
        }
    }
}
