namespace CurvTabDental.Infrastructure.Identity;

/// <summary>Central role names and the role lists used by [Authorize(Roles = ...)] (REQ-02, section 9 of the SRS).</summary>
public static class StaffRoles
{
    public const string SuperAdmin = "SuperAdmin";
    public const string PracticeAdmin = "PracticeAdmin";
    public const string Receptionist = "Receptionist";
    public const string Dentist = "Dentist";
    public const string LabTechnician = "LabTechnician";
    public const string Finance = "Finance";
    public const string Orthodontist = "Orthodontist";

    public static readonly string[] All =
    {
        SuperAdmin, PracticeAdmin, Receptionist, Dentist, LabTechnician, Finance, Orthodontist
    };

    /// <summary>Roles a PracticeAdmin may hand out. PracticeAdmin/SuperAdmin are created by the platform only.</summary>
    public static readonly string[] PracticeStaffAssignable =
    {
        Receptionist, Dentist, LabTechnician, Finance, Orthodontist
    };

    // Comma separated lists for [Authorize(Roles = ...)]
    public const string PatientRead =
        // CT_LAB_PATIENT_READ_REMOVAL
        PracticeAdmin + "," + Receptionist + "," + Dentist + "," + Finance + "," + Orthodontist;

    public const string PatientWrite = Receptionist + "," + Dentist + "," + PracticeAdmin;
}
