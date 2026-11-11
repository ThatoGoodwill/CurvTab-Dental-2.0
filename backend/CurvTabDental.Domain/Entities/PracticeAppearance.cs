using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// A separate appearance configuration per tenant. Does not affect clinical data.
public sealed class PracticeAppearance : IPracticeOwned
{
    public Guid DentalPracticeId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Tagline { get; set; } = string.Empty;
    public string PrimaryColor { get; set; } = "#126CE5";
    public string AccentColor { get; set; } = "#14B8A6";
    public string LayoutPreset { get; set; } = "Classic";
    public string NavigationMode { get; set; } = "Sidebar";
    // Practice-wide default colour theme: "white", "blue" (Blue & White) or "dark" (Dark Blue).
    // Every account in the practice uses it unless that account picks its own.
    public string ThemeSurface { get; set; } = "blue";
    public string EnabledModulesJson { get; set; } = "[\"Patients\",\"Appointments\",\"Daily Patients\",\"Consultations\",\"Checkout & Payments\",\"Dental Charting\",\"Clinical Imaging\",\"Orthodontics\"]";
    public string? SlidesJson { get; set; }
    public string? LogoUrl { get; set; }
    public string? BadgeUrl { get; set; }
    public string? LoginBackgroundUrl { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
