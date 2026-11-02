using System.Security.Claims;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Identity;

namespace CurvTabDental.API.Security;

/// <summary>Reads the caller from the validated auth cookie. Nothing here trusts request data.</summary>
public class HttpCurrentUser : ICurrentUser
{
    private readonly IHttpContextAccessor _accessor;

    public HttpCurrentUser(IHttpContextAccessor accessor)
    {
        _accessor = accessor;
    }

    private ClaimsPrincipal? Principal => _accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;

    public Guid? UserId =>
        Guid.TryParse(Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    public Guid? PracticeId =>
        Guid.TryParse(Principal?.FindFirstValue(ClaimNames.PracticeId), out var id) ? id : null;

    public string? Role => Principal?.FindFirstValue(ClaimTypes.Role);

    public string? IpAddress => _accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();
}
