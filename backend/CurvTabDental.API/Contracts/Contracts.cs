using System.ComponentModel.DataAnnotations;

namespace CurvTabDental.API.Contracts;

// ---------- Auth ----------
public class LoginRequest
{
    [Required, EmailAddress, StringLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, StringLength(128)]
    public string Password { get; set; } = string.Empty;
}

public class ChangePasswordRequest
{
    [Required, StringLength(128)]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required, StringLength(128, MinimumLength = 10)]
    public string NewPassword { get; set; } = string.Empty;
}

public record UserProfileDto(
    Guid Id,
    string Email,
    string FullName,
    string? Role,
    Guid? PracticeId,
    string? PracticeName,
    bool MustChangePassword);

// ---------- Practices ----------
public record PracticeDto(
    Guid Id,
    string Name,
    string? Email,
    string? PhoneNumber,
    string? Address,
    bool IsActive,
    DateTime CreatedAtUtc);
    

public record PlatformPracticeDto(
    Guid Id,
    string Name,
    string? Email,
    string? PhoneNumber,
    string? Address,
    bool IsActive,
    DateTime CreatedAtUtc,
    int StaffCount);

public class UpdatePracticeRequest
{
    [Required, StringLength(200)]
    public string Name { get; set; } = string.Empty;

    [EmailAddress, StringLength(256)]
    public string? Email { get; set; }

    [StringLength(30)]
    public string? PhoneNumber { get; set; }

    [StringLength(500)]
    public string? Address { get; set; }
}

/// <summary>Platform creates a practice together with its first PracticeAdmin in one transaction.</summary>
public class CreatePracticeRequest : UpdatePracticeRequest
{
    [Required, EmailAddress, StringLength(256)]
    public string AdminEmail { get; set; } = string.Empty;

    [Required, StringLength(200)]
    public string AdminFullName { get; set; } = string.Empty;

    [Required, StringLength(128, MinimumLength = 10)]
    public string AdminTemporaryPassword { get; set; } = string.Empty;
}

public class SetActiveRequest
{
    public bool IsActive { get; set; }
}

// ---------- Staff ----------
public class CreateStaffRequest
{
    [Required, EmailAddress, StringLength(256)]
    public string Email { get; set; } = string.Empty;

    [Required, StringLength(200)]
    public string FullName { get; set; } = string.Empty;

    [Required]
    public string Role { get; set; } = string.Empty;

    [Required, StringLength(128, MinimumLength = 10)]
    public string TemporaryPassword { get; set; } = string.Empty;
}

public class ResetPasswordRequest
{
    [Required, StringLength(128, MinimumLength = 10)]
    public string TemporaryPassword { get; set; } = string.Empty;
}

public record StaffDto(
    Guid Id,
    string Email,
    string FullName,
    string Role,
    bool IsActive,
    bool MustChangePassword);

// ---------- Patients ----------
public class PatientRequest : IValidatableObject
{
    [StringLength(20)]
    public string? Title { get; set; }

    [Required, StringLength(100)]
    public string FirstName { get; set; } = string.Empty;

    [Required, StringLength(100)]
    public string LastName { get; set; } = string.Empty;

    public DateOnly? DateOfBirth { get; set; }

    [StringLength(20)]
    public string? Gender { get; set; }

    [StringLength(40)]
    public string? IdNumber { get; set; }

    [StringLength(30)]
    public string? PhoneNumber { get; set; }

    [EmailAddress, StringLength(256)]
    public string? Email { get; set; }

    [StringLength(500)]
    public string? Address { get; set; }

    [StringLength(200)]
    public string? EmergencyContactName { get; set; }

    [StringLength(30)]
    public string? EmergencyContactPhone { get; set; }

    [Required, RegularExpression("^(Cash|MedicalAid)$", ErrorMessage = "PaymentMethod must be 'Cash' or 'MedicalAid'.")]
    public string PaymentMethod { get; set; } = "Cash";

    [StringLength(100)]
    public string? MedicalAidScheme { get; set; }

    [StringLength(100)]
    public string? MedicalAidOption { get; set; }

    [StringLength(50)]
    public string? MedicalAidMemberNumber { get; set; }

    /// <summary>Tick when the patient has given consent to processing of their information.</summary>
    public bool ConsentGiven { get; set; }

    // Optional for API backward compatibility; the new registration wizard always supplies both.
    public PatientRegistrationRequest? Registration { get; set; }
    public PatientRegistrationMedicalRequest? RegistrationMedicalHistory { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (PaymentMethod == "MedicalAid")
        {
            if (string.IsNullOrWhiteSpace(MedicalAidScheme))
                yield return new ValidationResult("Medical aid scheme is required.", new[] { nameof(MedicalAidScheme) });
            if (string.IsNullOrWhiteSpace(MedicalAidMemberNumber))
                yield return new ValidationResult("Medical aid member number is required.", new[] { nameof(MedicalAidMemberNumber) });
        }
        if (DateOfBirth is DateOnly dob && dob > DateOnly.FromDateTime(DateTime.UtcNow))
            yield return new ValidationResult("Date of birth cannot be in the future.", new[] { nameof(DateOfBirth) });
    }
}

// New comprehensive registration payload: administrative declaration and patient-supplied history.
public sealed class PatientRegistrationRequest
{
    [StringLength(30)] public string? HomePhone { get; set; }
    [StringLength(30)] public string? WorkPhone { get; set; }
    [StringLength(150)] public string? Occupation { get; set; }
    [StringLength(200)] public string? Employer { get; set; }
    [StringLength(200)] public string? ResponsibleName { get; set; }
    [StringLength(100)] public string? ResponsibleRelationship { get; set; }
    [StringLength(30)] public string? ResponsiblePhone { get; set; }
    [EmailAddress, StringLength(256)] public string? ResponsibleEmail { get; set; }
    [StringLength(500)] public string? ResponsibleAddress { get; set; }
    [StringLength(40)] public string? ResponsibleIdNumber { get; set; }
    [StringLength(4000)] public string? ProfileJson { get; set; }
    public bool? GuardianConsent { get; set; }
    public bool DeclarationAccepted { get; set; }
    public bool InformationConsent { get; set; }
    [StringLength(200)] public string? SignerName { get; set; }
    [StringLength(40)] public string? SignerCapacity { get; set; }
    public string? SignatureDataUrl { get; set; }
    [StringLength(200)] public string? WitnessName { get; set; }
    public string? WitnessSignatureDataUrl { get; set; }
}

public sealed class PatientRegistrationMedicalRequest
{
    [StringLength(4000)] public string? Allergies { get; set; }
    [StringLength(4000)] public string? CurrentMedications { get; set; }
    [StringLength(4000)] public string? MedicalConditions { get; set; }
    [StringLength(4000)] public string? DentalHistory { get; set; }
    [StringLength(4000)] public string? AdditionalNotes { get; set; }
}

public record PatientDto(
    Guid Id,
    string? Title,
    string FirstName,
    string LastName,
    DateOnly? DateOfBirth,
    string? Gender,
    string? IdNumber,
    string? PhoneNumber,
    string? Email,
    string? Address,
    string? EmergencyContactName,
    string? EmergencyContactPhone,
    string PaymentMethod,
    string? MedicalAidScheme,
    string? MedicalAidOption,
    string? MedicalAidMemberNumber,
    bool ConsentRecorded,
    bool IsArchived,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

// ---------- Audit ----------
public record AuditEventDto(
    Guid Id,
    DateTime OccurredAtUtc,
    Guid? ActorUserId,
    string Action,
    string? EntityType,
    string? EntityId,
    bool Succeeded,
    string? Detail);
