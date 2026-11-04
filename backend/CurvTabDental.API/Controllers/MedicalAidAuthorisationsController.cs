using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

[ApiController]
[Route("api/finance/medical-aid/authorisations")]
[Authorize(Roles = "Receptionist,PracticeAdmin")]
public sealed class MedicalAidAuthorisationsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public MedicalAidAuthorisationsController(
        DentalDbContext db,
        ICurrentUser current,
        IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record CreateRequest(
        Guid RequestId,
        Guid MembershipId,
        string TreatmentDescription,
        decimal RequestedAmount,
        string Reason);

    public sealed record DecisionRequest(
        string Decision,
        decimal ApprovedAmount,
        string? AuthorisationNumber,
        DateOnly? ExpiresOn,
        string EvidenceReference,
        string Reason);

    private static bool ValidMoney(decimal amount) =>
        amount >= 0m &&
        amount <= 10_000_000m &&
        decimal.Round(amount, 2) == amount;

    private static DateOnly BusinessToday() =>
        DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTimeFromUtc(
                DateTime.UtcNow,
                TimeZoneInfo.FindSystemTimeZoneById(
                    "Africa/Johannesburg")));

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var rows = await (
            from a in _db.Set<MedicalAidAuthorisation>()
                .AsNoTracking()
            join m in _db.Set<MedicalAidMembership>()
                .AsNoTracking()
                on a.MembershipId equals m.Id
            join p in _db.Patients.AsNoTracking()
                on a.PatientId equals p.Id
            where a.DentalPracticeId == practiceId &&
                  m.DentalPracticeId == practiceId &&
                  p.DentalPracticeId == practiceId &&
                  m.PatientId == a.PatientId
            orderby a.CreatedAtUtc descending
            select new
            {
                a.Id,
                a.PatientId,
                a.MembershipId,
                patientName =
                    p.FirstName + " " + p.LastName,
                m.SchemeName,
                m.PlanName,
                a.TreatmentDescription,
                a.RequestedAmount,
                a.ApprovedAmount,
                a.Status,
                a.AuthorisationNumber,
                a.ExpiresOn,
                a.EvidenceReference,
                a.CreatedAtUtc,
                a.UpdatedAtUtc
            }
        ).Take(200).ToListAsync(ct);

        var today = BusinessToday();

        Response.Headers.CacheControl = "private, no-store";

        return Ok(rows.Select(x => new
        {
            x.Id,
            x.PatientId,
            x.MembershipId,
            x.patientName,
            x.SchemeName,
            x.PlanName,
            x.TreatmentDescription,
            x.RequestedAmount,
            x.ApprovedAmount,
            x.Status,
            x.AuthorisationNumber,
            x.ExpiresOn,
            x.EvidenceReference,
            x.CreatedAtUtc,
            x.UpdatedAtUtc,
            isExpired =
                (x.Status == "ApprovedReported" ||
                 x.Status == "PartiallyApprovedReported") &&
                x.ExpiresOn.HasValue &&
                x.ExpiresOn.Value < today,
            source = "Manually recorded scheme correspondence"
        }));
    }

    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> History(
        Guid id, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        var exists = await _db.Set<MedicalAidAuthorisation>()
            .AsNoTracking()
            .AnyAsync(x =>
                x.Id == id &&
                x.DentalPracticeId == practiceId, ct);

        if (!exists) return NotFound();

        var events = await _db
            .Set<MedicalAidAuthorisationEvent>()
            .AsNoTracking()
            .Where(x =>
                x.AuthorisationId == id &&
                x.DentalPracticeId == practiceId)
            .OrderBy(x => x.PerformedAtUtc)
            .ThenBy(x => x.Id)
            .Select(x => new
            {
                x.Id,
                x.EventType,
                x.FromStatus,
                x.ToStatus,
                x.ApprovedAmount,
                x.AuthorisationNumber,
                x.ExpiresOn,
                x.EvidenceReference,
                x.Reason,
                x.PerformedByUserId,
                x.PerformedAtUtc
            })
            .ToListAsync(ct);

        Response.Headers.CacheControl = "private, no-store";
        return Ok(events);
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        var treatment = request.TreatmentDescription?.Trim() ?? "";
        var reason = request.Reason?.Trim() ?? "";

        if (request.RequestId == Guid.Empty ||
            request.MembershipId == Guid.Empty ||
            treatment.Length is < 5 or > 300 ||
            !ValidMoney(request.RequestedAmount) ||
            request.RequestedAmount == 0m ||
            reason.Length is < 5 or > 1000)
        {
            return BadRequest(new
            {
                message = "Provide a valid membership, treatment, " +
                          "amount, request ID and reason."
            });
        }

        var membership = await _db
            .Set<MedicalAidMembership>()
            .AsNoTracking()
            .SingleOrDefaultAsync(x =>
                x.Id == request.MembershipId &&
                x.DentalPracticeId == practiceId, ct);

        if (membership is null)
            return NotFound(new
            {
                message = "Membership not found."
            });

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        var previous = await _db
            .Set<MedicalAidAuthorisation>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.DentalPracticeId == practiceId &&
                x.RequestId == request.RequestId, ct);

        if (previous is not null)
            return Conflict(new
            {
                message = "Request ID already used.",
                authorisationId = previous.Id
            });

        var now = DateTime.UtcNow;

        var authorisation = new MedicalAidAuthorisation
        {
            DentalPracticeId = practiceId,
            PatientId = membership.PatientId,
            MembershipId = membership.Id,
            RequestId = request.RequestId,
            TreatmentDescription = treatment,
            RequestedAmount = request.RequestedAmount,
            Status = "RecordedPending",
            CreatedByUserId = actorId,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        var initialEvent = new MedicalAidAuthorisationEvent
        {
            DentalPracticeId = practiceId,
            AuthorisationId = authorisation.Id,
            EventType = "REQUEST_RECORDED",
            FromStatus = "",
            ToStatus = "RecordedPending",
            Reason = reason,
            PerformedByUserId = actorId,
            PerformedAtUtc = now
        };

        _db.Set<MedicalAidAuthorisation>().Add(authorisation);
        _db.Set<MedicalAidAuthorisationEvent>().Add(initialEvent);

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "MEDICAL_AID_AUTHORISATION_REQUEST_RECORDED",
            "MedicalAidAuthorisation",
            authorisation.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Created(
            $"/api/finance/medical-aid/authorisations/{authorisation.Id}/history",
            new
            {
                authorisation.Id,
                authorisation.Status,
                message = "Internal request recorded. " +
                          "Not electronically submitted."
            });
    }

    [HttpPost("{id:guid}/decision")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> RecordDecision(
        Guid id,
        [FromBody] DecisionRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId)
            return Forbid();

        if (_current.UserId is not Guid actorId)
            return Unauthorized();

        var allowed = new[]
        {
            "ApprovedReported",
            "PartiallyApprovedReported",
            "DeclinedReported"
        };

        var reason = request.Reason?.Trim() ?? "";
        var reference = request.EvidenceReference?.Trim() ?? "";
        var number = request.AuthorisationNumber?.Trim();

        if (!allowed.Contains(request.Decision) ||
            !ValidMoney(request.ApprovedAmount) ||
            reason.Length is < 5 or > 1000 ||
            reference.Length is < 3 or > 300 ||
            number?.Length > 100)
        {
            return BadRequest(new
            {
                message = "Provide a valid reported decision, " +
                          "amount, evidence reference and reason."
            });
        }

        await using var tx =
            await _db.Database.BeginTransactionAsync(ct);

        var authorisation = await _db
            .Set<MedicalAidAuthorisation>()
            .FromSqlInterpolated(
                $"SELECT * FROM \"MedicalAidAuthorisations\" WHERE \"Id\" = {id} AND \"DentalPracticeId\" = {practiceId} FOR UPDATE")
            .SingleOrDefaultAsync(ct);

        if (authorisation is null)
            return NotFound();

        if (authorisation.Status != "RecordedPending")
            return Conflict(new
            {
                message = "A decision is already recorded. " +
                          "Use a controlled amendment workflow."
            });

        var declined = request.Decision == "DeclinedReported";
        var fullyApproved = request.Decision == "ApprovedReported";

        if (
            (declined && request.ApprovedAmount != 0m) ||
            (!declined &&
                (request.ApprovedAmount <= 0m ||
                 request.ApprovedAmount >
                    authorisation.RequestedAmount ||
                 string.IsNullOrWhiteSpace(number) ||
                 request.ExpiresOn is null)) ||
            (fullyApproved &&
                request.ApprovedAmount != authorisation.RequestedAmount) ||
            (request.Decision == "PartiallyApprovedReported" &&
                request.ApprovedAmount >= authorisation.RequestedAmount)
        )
        {
            return BadRequest(new
            {
                message = "Approved amounts must reconcile with " +
                          "the requested amount. Approvals require " +
                          "a scheme reference and expiry date."
            });
        }

        var now = DateTime.UtcNow;

        authorisation.Status = request.Decision;
        authorisation.ApprovedAmount = request.ApprovedAmount;
        authorisation.AuthorisationNumber = number;
        authorisation.ExpiresOn = request.ExpiresOn;
        authorisation.EvidenceReference = reference;
        authorisation.UpdatedAtUtc = now;

        _db.Set<MedicalAidAuthorisationEvent>().Add(
            new MedicalAidAuthorisationEvent
            {
                DentalPracticeId = practiceId,
                AuthorisationId = authorisation.Id,
                EventType = "DECISION_RECORDED",
                FromStatus = "RecordedPending",
                ToStatus = request.Decision,
                ApprovedAmount = request.ApprovedAmount,
                AuthorisationNumber = number,
                ExpiresOn = request.ExpiresOn,
                EvidenceReference = reference,
                Reason = reason,
                PerformedByUserId = actorId,
                PerformedAtUtc = now
            });

        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync(
            "MEDICAL_AID_AUTHORISATION_DECISION_RECORDED",
            "MedicalAidAuthorisation",
            authorisation.Id.ToString(),
            ct: ct);

        await tx.CommitAsync(ct);

        return Ok(new
        {
            authorisation.Id,
            authorisation.Status,
            authorisation.ApprovedAmount,
            authorisation.ExpiresOn,
            message = "Reported scheme decision recorded. " +
                      "Independent verification not performed."
        });
    }
}
