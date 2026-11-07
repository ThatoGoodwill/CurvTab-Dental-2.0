using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Middleware;

/// <summary>
/// Runs after authentication on every request. Re-checks the database so that:
///  - a deactivated user, or a user of a deactivated practice, is signed out immediately;
///  - a user with a temporary password can only reach /api/auth/* until they change it.
/// (An auth cookie alone would stay valid until it expired.)
/// </summary>
public class ActiveUserMiddleware
{
    private readonly RequestDelegate _next;

    public ActiveUserMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, DentalDbContext db, ICurrentUser current)
    {
        if (current.IsAuthenticated && current.UserId is Guid userId)
        {
            var ct = context.RequestAborted;

            var state = await db.Users
                .AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => new { u.IsActive, u.MustChangePassword, u.DentalPracticeId })
                .FirstOrDefaultAsync(ct);

            var practiceActive = true;
            if (state?.DentalPracticeId is Guid practiceId)
            {
                practiceActive = await db.DentalPractices
                    .AsNoTracking()
                    .AnyAsync(p => p.Id == practiceId && p.IsActive, ct);
            }

            if (state is null || !state.IsActive || !practiceActive)
            {
                await context.SignOutAsync(IdentityConstants.ApplicationScheme);
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new
                {
                    title = "Account is not active.",
                    status = 401
                });
                return;
            }

            // Temporary-password users may access authentication endpoints
            // and the public, read-only practice-branding endpoint only.
            var isAuthEndpoint =
                context.Request.Path.StartsWithSegments("/api/auth");

            var isPublicBrandingEndpoint =
                HttpMethods.IsGet(context.Request.Method) &&
                context.Request.Path.StartsWithSegments("/api/public/practice-branding");

            if (state.MustChangePassword &&
                !isAuthEndpoint &&
                !isPublicBrandingEndpoint)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new
                {
                    title = "You must change your temporary password first.",
                    status = 403,
                    code = "PASSWORD_CHANGE_REQUIRED"
                });
                return;
            }
        }

        await _next(context);
    }
}
