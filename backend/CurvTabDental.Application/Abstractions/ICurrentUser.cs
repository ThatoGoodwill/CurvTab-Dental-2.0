namespace CurvTabDental.Application.Abstractions;

/// <summary>
/// The authenticated caller, as established by the server from the signed auth cookie.
/// The practice id ALWAYS comes from here, never from a URL, query string or request body (REQ-01).
/// </summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }
    Guid? UserId { get; }

    /// <summary>Null for platform users (SuperAdmin) who belong to no practice.</summary>
    Guid? PracticeId { get; }

    string? Role { get; }
    string? IpAddress { get; }
}
