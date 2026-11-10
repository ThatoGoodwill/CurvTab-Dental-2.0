
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Authorize(Roles = "PracticeAdmin,Dentist")]
[Route("api/practice/procedure-prices")]
public sealed class ProcedurePricingController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;

    public ProcedurePricingController(
        DentalDbContext db, ICurrentUser current)
    {
        _db = db;
        _current = current;
    }

    public record PriceRequest(
        string Code,
        string Name,
        string Category,
        decimal Price,
        bool IsActive,
        DateTime? ExpectedUpdatedAtUtc,
        bool RequiresLab = false,
        decimal SupplierEstimate = 0m
    );

    private static bool Valid(PriceRequest? r) =>
        r != null &&
        !string.IsNullOrWhiteSpace(r.Code) &&
        r.Code.Trim().Length <= 40 &&
        !string.IsNullOrWhiteSpace(r.Name) &&
        r.Name.Trim().Length <= 160 &&
        (r.Category?.Trim().Length ?? 0) <= 80 &&
        r.Price > 0 &&
        r.Price <= 10000000m &&
        decimal.Round(r.Price, 2) == r.Price &&
        r.SupplierEstimate >= 0m &&
        r.SupplierEstimate <= 10000000m &&
        decimal.Round(r.SupplierEstimate, 2) == r.SupplierEstimate;

    [HttpGet]
    public async Task<IActionResult> List(
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var rows = await _db.ProcedurePrices
            .AsNoTracking()
            .Where(x => x.DentalPracticeId == practiceId)
            .OrderBy(x => x.Category)
            .ThenBy(x => x.Name)
            .Select(x => new {
                x.Id,
                x.Code,
                x.Name,
                x.Category,
                x.Price,
                x.IsActive,
                x.RequiresLab,
                x.SupplierEstimate,
                x.CreatedAtUtc,
                x.UpdatedAtUtc
            })
            .ToListAsync(ct);

        return Ok(rows);
    }

    [Authorize(Roles = "PracticeAdmin")]
    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] PriceRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        if (!Valid(request))
            return BadRequest(new {
                message = "Enter a valid code, name and positive ZAR price."
            });

        var code = request.Code.Trim().ToUpperInvariant();

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        if (await _db.ProcedurePrices.AnyAsync(
            x => x.DentalPracticeId == practiceId &&
                 x.Code == code, ct))
            return Conflict(new {
                message = "This procedure code already exists."
            });

        var now = DateTime.UtcNow;

        var item = new ProcedurePrice {
            DentalPracticeId = practiceId,
            Code = code,
            Name = request.Name.Trim(),
            Category = string.IsNullOrWhiteSpace(request.Category)
                ? "General" : request.Category.Trim(),
            Price = request.Price,
            IsActive = request.IsActive,
            RequiresLab = request.RequiresLab,
            SupplierEstimate = request.RequiresLab ? request.SupplierEstimate : 0m,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        _db.ProcedurePrices.Add(item);

        _db.ProcedurePriceHistories.Add(
            new ProcedurePriceHistory {
                DentalPracticeId = practiceId,
                ProcedurePriceId = item.Id,
                ChangedByUserId = actorId,
                Action = "Created",
                Code = item.Code,
                Name = item.Name,
                PreviousPrice = null,
                NewPrice = item.Price,
                IsActive = item.IsActive,
                ChangedAtUtc = now
            });

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return Ok(new { item.Id });
    }

    [Authorize(Roles = "PracticeAdmin")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] PriceRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        if (!Valid(request))
            return BadRequest(new {
                message = "Enter a valid code, name and positive ZAR price."
            });

        if (!request.ExpectedUpdatedAtUtc.HasValue)
            return BadRequest(new {
                message = "Reload the current procedure before editing."
            });

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        var item = await _db.ProcedurePrices
            .FirstOrDefaultAsync(x =>
                x.Id == id &&
                x.DentalPracticeId == practiceId, ct);

        if (item == null)
            return NotFound();

        if (item.UpdatedAtUtc != request.ExpectedUpdatedAtUtc.Value)
            return Conflict(new {
                message = "This procedure was updated. Refresh and try again."
            });

        var code = request.Code.Trim().ToUpperInvariant();

        if (await _db.ProcedurePrices.AnyAsync(
            x => x.DentalPracticeId == practiceId &&
                 x.Code == code &&
                 x.Id != id, ct))
            return Conflict(new {
                message = "This procedure code already exists."
            });

        var previousPrice = item.Price;

        item.Code = code;
        item.Name = request.Name.Trim();
        item.Category = string.IsNullOrWhiteSpace(request.Category)
            ? "General" : request.Category.Trim();
        item.Price = request.Price;
        item.IsActive = request.IsActive;
        item.RequiresLab = request.RequiresLab;
        item.SupplierEstimate = request.RequiresLab ? request.SupplierEstimate : 0m;
        item.UpdatedAtUtc = DateTime.UtcNow;

        _db.ProcedurePriceHistories.Add(
            new ProcedurePriceHistory {
                DentalPracticeId = practiceId,
                ProcedurePriceId = item.Id,
                ChangedByUserId = actorId,
                Action = "Updated",
                Code = item.Code,
                Name = item.Name,
                PreviousPrice = previousPrice,
                NewPrice = item.Price,
                IsActive = item.IsActive,
                ChangedAtUtc = item.UpdatedAtUtc
            });

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        return Ok(new { item.Id });
    }

    [Authorize(Roles = "PracticeAdmin")]
    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> History(
        Guid id, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (!await _db.ProcedurePrices.AnyAsync(
            x => x.Id == id &&
                 x.DentalPracticeId == practiceId, ct))
            return NotFound();

        return Ok(await _db.ProcedurePriceHistories
            .AsNoTracking()
            .Where(x =>
                x.DentalPracticeId == practiceId &&
                x.ProcedurePriceId == id)
            .OrderByDescending(x => x.ChangedAtUtc)
            .Select(x => new {
                x.Action,
                x.Code,
                x.Name,
                x.PreviousPrice,
                x.NewPrice,
                x.IsActive,
                x.ChangedAtUtc,
                x.ChangedByUserId
            })
            .ToListAsync(ct));
    }
}
