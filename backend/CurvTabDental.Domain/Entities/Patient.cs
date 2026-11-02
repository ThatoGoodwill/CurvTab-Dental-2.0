using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

/// <summary>A patient registered at ONE practice (FR-010). Never shared across practices.</summary>
public class Patient : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }

    public string? Title { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateOnly? DateOfBirth { get; set; }
    public string? Gender { get; set; }

    /// <summary>National ID / passport. Sensitive: hidden from Lab and Finance roles.</summary>
    public string? IdNumber { get; set; }

    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public string? EmergencyContactName { get; set; }
    public string? EmergencyContactPhone { get; set; }

    /// <summary>"Cash" or "MedicalAid".</summary>
    public string PaymentMethod { get; set; } = "Cash";
    public string? MedicalAidScheme { get; set; }
    public string? MedicalAidOption { get; set; }
    public string? MedicalAidMemberNumber { get; set; }

    /// <summary>When the patient consented to data processing (POPIA). Null = not recorded.</summary>
    public DateTime? ConsentRecordedAtUtc { get; set; }

    public bool IsArchived { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public Guid? CreatedByUserId { get; set; }
}
