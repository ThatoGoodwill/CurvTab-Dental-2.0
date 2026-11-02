namespace CurvTabDental.API.Middleware;

/// <summary>
/// CSRF defence for cookie authentication (NFR-01). Every state-changing request must carry
/// "X-Requested-With: XMLHttpRequest". A browser cannot add a custom header to a cross-site form
/// post, and CORS only allows our own front-end origin to send it. Combined with SameSite=Lax cookies.
/// The React API client must always send this header.
/// </summary>
public class CsrfHeaderMiddleware
{
    private static readonly HashSet<string> UnsafeMethods =
        new(StringComparer.OrdinalIgnoreCase) { "POST", "PUT", "PATCH", "DELETE" };

    private readonly RequestDelegate _next;

    public CsrfHeaderMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (UnsafeMethods.Contains(context.Request.Method))
        {
            var header = context.Request.Headers["X-Requested-With"].ToString();
            if (!string.Equals(header, "XMLHttpRequest", StringComparison.OrdinalIgnoreCase))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new
                {
                    title = "Missing required X-Requested-With header.",
                    status = 403
                });
                return;
            }
        }

        await _next(context);
    }
}
