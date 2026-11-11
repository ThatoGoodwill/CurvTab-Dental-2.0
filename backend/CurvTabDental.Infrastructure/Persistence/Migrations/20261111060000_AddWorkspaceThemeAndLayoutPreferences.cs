using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using CurvTabDental.Infrastructure.Persistence;
#nullable disable

namespace CurvTabDental.Infrastructure.Persistence.Migrations;

// Practice-wide default theme + per-account theme/layout preferences.
// Existing practices default to the client's "Blue & White" theme; existing users follow the practice default.
[DbContext(typeof(DentalDbContext))]
[Migration("20261111060000_AddWorkspaceThemeAndLayoutPreferences")]
public sealed class AddWorkspaceThemeAndLayoutPreferences : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "ThemeSurface",
            table: "PracticeAppearances",
            type: "character varying(10)",
            maxLength: 10,
            nullable: false,
            defaultValue: "blue");

        migrationBuilder.AddColumn<string>(
            name: "PreferredThemeSurface",
            table: "AspNetUsers",
            type: "character varying(10)",
            maxLength: 10,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "PreferredLayoutPreset",
            table: "AspNetUsers",
            type: "character varying(20)",
            maxLength: 20,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "PreferredNavigationMode",
            table: "AspNetUsers",
            type: "character varying(12)",
            maxLength: 12,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "ThemeSurface", table: "PracticeAppearances");
        migrationBuilder.DropColumn(name: "PreferredThemeSurface", table: "AspNetUsers");
        migrationBuilder.DropColumn(name: "PreferredLayoutPreset", table: "AspNetUsers");
        migrationBuilder.DropColumn(name: "PreferredNavigationMode", table: "AspNetUsers");
    }
}
