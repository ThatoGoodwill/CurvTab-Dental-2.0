using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/medical-aid/invoice-settlement")]
[Authorize(Roles = "PracticeAdmin")]
public sealed class MedicalAidAllocationReversalsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public MedicalAidAllocationReversalsController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record ReverseRequest(string Reason);

    [HttpPost("allocations/{allocationId:guid}/reverse")]
    public async Task<IActionResult> Reverse(
        Guid allocationId,
        [FromBody] ReverseRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        var reason = request.Reason?.Trim() ?? "";

        if (reason.Length < 5 || reason.Length > 1000)
        {
            return BadRequest(new
            {
                message = "Provide a reversal reason between " +
                          "5 and 1000 characters."
            });
        }

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        var allocation = await _db.Set<MedicalAidInvoiceAllocation>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == allocationId &&
                x.DentalPracticeId == practiceId, ct);

        if (allocation is null)
            return NotFound(new
            {
                message = "Medical aid allocation not found."
            });

        // Use the same invoice lock as settlement posting,
        // patient payment allocations and credit notes.
        var invoice = await _db.Set<Invoice>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"Invoice\" WHERE \"Id\" = {allocation.InvoiceId} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (invoice is null)
            return Conflict(new
            {
                message = "The associated invoice was not found."
            });

        var alreadyReversed =
            await _db.Set<MedicalAidInvoiceAllocationReversal>()
                .AsNoTracking()
                .AnyAsync(x =>
                    x.DentalPracticeId == practiceId &&
                    x.AllocationId == allocationId, ct);

        if (alreadyReversed)
            return Conflict(new
            {
                message = "This allocation is already reversed."
            });

        var reversal = new MedicalAidInvoiceAllocationReversal
        {
            DentalPracticeId = practiceId,
            AllocationId = allocation.Id,
            Reason = reason,
            ReversedByUserId = actorId
        };

        _db.Set<MedicalAidInvoiceAllocationReversal>()
            .Add(reversal);

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "MEDICAL_AID_INVOICE_ALLOCATION_REVERSED",
            "MedicalAidInvoiceAllocationReversal",
            reversal.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        Response.Headers.CacheControl = "private, no-store";

        return Created(
            $"/api/finance/invoices/{allocation.InvoiceId}",
            new
            {
                reversal.Id,
                reversal.AllocationId,
                allocation.InvoiceId,
                allocation.Amount,
                reversal.Reason,
                reversal.ReversedAtUtc,
                status = "Reversed"
            });
    }
}
