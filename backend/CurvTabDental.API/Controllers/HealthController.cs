using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/health")]
[AllowAnonymous]
public class HealthController : ControllerBase
{
    private readonly DentalDbContext _db;

    public HealthController(DentalDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var dbUp = await _db.Database.CanConnectAsync(ct);
        var body = new { status = dbUp ? "Healthy" : "Unhealthy", database = dbUp ? "up" : "down" };
        return dbUp ? Ok(body) : StatusCode(StatusCodes.Status503ServiceUnavailable, body);
    }
}
