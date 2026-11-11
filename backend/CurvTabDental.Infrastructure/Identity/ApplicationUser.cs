using Microsoft.AspNetCore.Identity;

namespace CurvTabDental.Infrastructure.Identity;

/// <summary>A staff login. Each non-platform user belongs to exactly one practice (FR-002).</summary>
public class ApplicationUser : IdentityUser<Guid>
{
    public ApplicationUser()
    {
        Id = Guid.NewGuid();
    }

    public string FullName { get; set; } = string.Empty;

    /// <summary>Null only for platform users (SuperAdmin).</summary>
    public Guid? DentalPracticeId { get; set; }

    /// <summary>Soft-disable. Deactivated users are signed out on their next request.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>True after an admin sets a temporary password; blocks everything except /api/auth/*.</summary>
    public bool MustChangePassword { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // Personal workspace appearance. Null means "follow the practice default" (PracticeAppearance).
    public string? PreferredThemeSurface { get; set; }
    public string? PreferredLayoutPreset { get; set; }
    public string? PreferredNavigationMode { get; set; }
}
