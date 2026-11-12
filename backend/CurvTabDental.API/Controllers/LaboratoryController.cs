using System.Text;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// CT_LAB_EXCHANGE_V1 — practice data never leaks into partner views.
// All transitions are explicit; production, custody, QA, clinical outcome, closure differ.
[ApiController]
[Route("api/laboratory")]
[Authorize(Roles = "PracticeAdmin,Receptionist,Dentist,LabTechnician")]
public sealed class LaboratoryController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _user;
    private readonly IAuditService _audit;

    public LaboratoryController(DentalDbContext db, ICurrentUser user, IAuditService audit)
    { _db = db; _user = user; _audit = audit; }

    private bool PartnerRole => _user.Role == "LabTechnician";
    private Guid? Practice => _user.PracticeId;
    private Guid? Actor => _user.UserId;
    private IActionResult Invalid(string message) => Conflict(new { title = message });
    private static bool Has(string? value, int max) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= max;
    private static string Trim(string? s) => s?.Trim() ?? "";

    private IQueryable<LaboratoryOrder> VisibleOrders()
    {
        var q = _db.Set<LaboratoryOrder>().AsQueryable();
        if (PartnerRole)
            q = q.Where(o => _db.Set<LaboratoryMembership>().Any(m =>
                m.LaboratoryPartnerId == o.LaboratoryPartnerId && m.UserId == _user.UserId));
        return q;
    }
    private async Task<LaboratoryOrder?> Order(Guid id, CancellationToken ct) =>
        await VisibleOrders().FirstOrDefaultAsync(o => o.Id == id, ct);

    private async Task<LaboratoryItem?> Item(Guid id, CancellationToken ct)
    {
        var item = await _db.Set<LaboratoryItem>().FirstOrDefaultAsync(i => i.Id == id, ct);
        if (item is null) return null;
        return await Order(item.LaboratoryOrderId, ct) is null ? null : item;
    }
    private async Task<LaboratoryManifest?> Manifest(Guid id, CancellationToken ct)
    {
        var m = await _db.Set<LaboratoryManifest>().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (m is null) return null;
        if (PartnerRole && !await _db.Set<LaboratoryMembership>()
            .AnyAsync(x => x.LaboratoryPartnerId == m.LaboratoryPartnerId && x.UserId == Actor, ct)) return null;
        return m;
    }
    private void Log(LaboratoryOrder order, string action, string? note = null, Guid? item = null, Guid? manifest = null)
    {
        if (Actor is not Guid actor || Practice is not Guid practice) throw new InvalidOperationException("Missing staff account.");
        _db.Set<LaboratoryActivity>().Add(new LaboratoryActivity
        {
            DentalPracticeId = practice, LaboratoryOrderId = order.Id,
            LaboratoryItemId = item, LaboratoryManifestId = manifest,
            ActorUserId = actor, Action = action, Details = note
        });
    }
    private async Task RefreshOrder(Guid orderId, CancellationToken ct)
    {
        var order = await _db.Set<LaboratoryOrder>().FirstOrDefaultAsync(o => o.Id == orderId, ct);
        if (order is null || order.Status == "Closed") return;
        var statuses = await _db.Set<LaboratoryItem>().Where(i => i.LaboratoryOrderId == orderId)
            .Select(i => i.ClinicalStatus).ToListAsync(ct);
        order.Status = statuses.Any(s => s == "Completed") ? "PartiallyCompleted" : "Open";
    }

    public record NewPartner(string Name, string? Contact, string? Phone);
    public record AssignUser(Guid UserId);
    public record NewItem(string ToothCode, string Procedure, bool IsRemovable);
    public record NewOrder(Guid PatientId, Guid LaboratoryPartnerId, Guid? TreatmentPlanId,
        string Instructions, List<NewItem> Items);
    public record PrepareManifest(Guid LaboratoryPartnerId, string Direction, List<Guid> ItemIds);
    public record HandoverRequest(string CollectorName, string Waybill, int PackageCount, string Acknowledgement);
    public record ReceiveRequest(string ReceiverName, List<Guid> ReceivedItemIds, string? Discrepancy);
    public record IntakeRequest(string Decision, string Notes);
    public record ImpressionRequest(string Notes);
    public record ProductionRequest(string Stage, string Notes, DateTime? ExpectedAtUtc);
    public record QaRequest(bool Passed, string Notes);
    public record FitRequest(string Outcome, string Notes, string? GuaranteeNote);
    public record ReturnRequest(string Reason, string Instructions, string Priority, DateTime? DueAtUtc);
    public record PatientHandoverRequest(string ReceivedByName, string Notes);

    // Partner views use a pseudonymous patient reference — never demographics or medical history.
    // Agreed plan procedures that need lab work and are not finished yet,
    // so the practice knows which patients need a laboratory order.
    [Authorize(Roles = "PracticeAdmin,Receptionist,Dentist")]
    [HttpGet("lab-required")]
    public async Task<IActionResult> LabRequired(CancellationToken ct)
    {
        if (_user.PracticeId is not Guid practiceId) return Forbid();
        var rows = await (
            from proc in _db.PatientTreatmentProcedures.AsNoTracking()
            join plan in _db.PatientTreatmentPlans.AsNoTracking() on proc.TreatmentPlanId equals plan.Id
            join patient in _db.Patients.AsNoTracking() on proc.PatientId equals patient.Id
            where proc.DentalPracticeId == practiceId && proc.RequiresLab &&
                  proc.Status != "Completed" && proc.Status != "Cancelled" &&
                  proc.Status != "Declined" && plan.ConsentRecordedAtUtc != null &&
                  !_db.Set<LaboratoryOrder>().Any(o =>
                      o.DentalPracticeId == practiceId && o.PatientId == patient.Id &&
                      o.TreatmentPlanId == plan.Id && o.Status != "Closed" &&
                      _db.Set<LaboratoryItem>().Any(i => i.LaboratoryOrderId == o.Id &&
                          i.ToothCode == proc.ToothCode && i.Procedure == proc.Description))
            orderby plan.UpdatedAtUtc descending
            select new
            {
                procedureId = proc.Id,
                patientId = patient.Id,
                planId = plan.Id,
                patientName = patient.FirstName + " " + patient.LastName,
                planTitle = plan.Title,
                description = proc.Description,
                toothCode = proc.ToothCode
            }).Take(100).ToListAsync(ct);
        return Ok(rows);
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard(CancellationToken ct)
    {
        if (Practice is not Guid practice || Actor is null) return Forbid();
        Response.Headers.CacheControl = "private, no-store";
        var labs = await _db.Set<LaboratoryPartner>().AsNoTracking()
            .OrderBy(x => x.Name).ToListAsync(ct);
        if (PartnerRole)
        {
            var mapped = await _db.Set<LaboratoryMembership>().AsNoTracking()
                .Where(x => x.UserId == Actor).Select(x => x.LaboratoryPartnerId).ToListAsync(ct);
            labs = labs.Where(x => mapped.Contains(x.Id)).ToList();
        }
        var orders = await VisibleOrders().AsNoTracking()
            .OrderByDescending(o => o.CreatedAtUtc).Take(250).ToListAsync(ct);
        var ids = orders.Select(o => o.Id).ToList();
        var items = await _db.Set<LaboratoryItem>().AsNoTracking()
            .Where(i => ids.Contains(i.LaboratoryOrderId)).ToListAsync(ct);
        var itemIds = items.Select(i => i.Id).ToList();
        var labIds = labs.Select(l => l.Id).ToList();
        var manifests = await _db.Set<LaboratoryManifest>().AsNoTracking()
            .Where(m => labIds.Contains(m.LaboratoryPartnerId))
            .OrderByDescending(m => m.PreparedAtUtc).Take(250).ToListAsync(ct);
        var manifestIds = manifests.Select(m => m.Id).ToList();
        var lines = await _db.Set<LaboratoryManifestLine>().AsNoTracking()
            .Where(x => manifestIds.Contains(x.LaboratoryManifestId) && itemIds.Contains(x.LaboratoryItemId))
            .ToListAsync(ct);
        var corrections = await _db.Set<LaboratoryCorrection>().AsNoTracking()
            .Where(c => itemIds.Contains(c.LaboratoryItemId)).ToListAsync(ct);
        var activities = await _db.Set<LaboratoryActivity>().AsNoTracking()
            .Where(a => ids.Contains(a.LaboratoryOrderId))
            .OrderByDescending(a => a.AtUtc).Take(750).ToListAsync(ct);
        var evidence = await _db.Set<LaboratoryEvidence>().AsNoTracking()
            .Where(e => itemIds.Contains(e.LaboratoryItemId))
            .Select(e => new { e.Id, e.LaboratoryOrderId, e.LaboratoryItemId, e.FileName, e.ContentType, e.UploadedAtUtc })
            .ToListAsync(ct);
        var patientIds = orders.Select(o => o.PatientId).Distinct().ToList();
        var patients = PartnerRole ? new List<Patient>() : await _db.Patients.AsNoTracking()
            .Where(p => patientIds.Contains(p.Id)).ToListAsync(ct);
        return Ok(new
        {
            partnerMode = PartnerRole,
            partners = labs.Select(l => new { l.Id, l.Name, l.Contact, l.Phone, l.IsActive }),
            orders = orders.Select(o => new {
                o.Id, o.Reference, o.PatientId, o.LaboratoryPartnerId, o.TreatmentPlanId,
                patientName = PartnerRole ? "Patient ref: " + o.PatientId.ToString("N")[..8].ToUpperInvariant()
                    : (patients.FirstOrDefault(p => p.Id == o.PatientId) is { } p ? p.FirstName + " " + p.LastName : "Patient"),
                o.Instructions, o.Status, o.CreatedAtUtc, o.ClosedAtUtc,
                items = items.Where(i => i.LaboratoryOrderId == o.Id).Select(i => new {
                    i.Id, i.ToothCode, i.Procedure, i.IsRemovable,
                    i.ManufacturingStatus, i.CustodyStatus, i.QaStatus, i.ClinicalStatus,
                    i.ActiveManifestId, i.ExpectedAtUtc, i.CompletedAtUtc, i.PatientHandedOverAtUtc,
                    i.GuaranteeNote, i.CorrectionCount
                }).ToList()
            }),
            manifests = manifests.Select(m => new {
                m.Id, m.Reference, m.LaboratoryPartnerId, m.Direction, m.Status,
                m.PackageCount, m.CollectorName, m.ReceiverName, m.Waybill, m.Acknowledgement,
                m.Discrepancy, m.PreparedAtUtc, m.HandedOverAtUtc, m.ReceivedAtUtc,
                lines = lines.Where(l => l.LaboratoryManifestId == m.Id)
                    .Select(l => new { l.LaboratoryItemId, l.ReceivedAtUtc }).ToList()
            }),
            corrections = corrections.Select(c => new {
                c.Id, c.LaboratoryItemId, c.Kind, c.Status, c.Reason, c.Instructions,
                c.Priority, c.DueAtUtc, c.CreatedAtUtc, c.ResolvedAtUtc
            }),
            activities = activities.Select(a => new {
                a.Id, a.LaboratoryOrderId, a.LaboratoryItemId, a.LaboratoryManifestId,
                a.Action, a.Details, a.ActorUserId, a.AtUtc
            }),
            evidence
        });
    }

    [HttpPost("partners")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> AddPartner(NewPartner request, CancellationToken ct)
    {
        if (Practice is not Guid practice) return Forbid();
        if (!Has(request.Name, 160) || request.Contact?.Length > 120 || request.Phone?.Length > 50)
            return BadRequest(new { title = "Enter a laboratory name (maximum 160 characters)." });
        if (await _db.Set<LaboratoryPartner>().AnyAsync(p => p.Name == Trim(request.Name), ct))
            return Invalid("A laboratory with this name already exists.");
        var lab = new LaboratoryPartner { DentalPracticeId = practice, Name = Trim(request.Name),
            Contact = Trim(request.Contact), Phone = Trim(request.Phone) };
        _db.Set<LaboratoryPartner>().Add(lab);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("LAB_PARTNER_CREATED", "LaboratoryPartner", lab.Id.ToString(), ct: ct);
        return Ok(new { lab.Id, lab.Name });
    }

    [HttpPost("partners/{id:guid}/members")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> AssignPartnerUser(Guid id, AssignUser request, CancellationToken ct)
    {
        if (Practice is not Guid practice) return Forbid();
        if (!await _db.Set<LaboratoryPartner>().AnyAsync(p => p.Id == id && p.IsActive, ct)) return NotFound();
        var valid = await (from u in _db.Users
                           join ur in _db.UserRoles on u.Id equals ur.UserId
                           join r in _db.Roles on ur.RoleId equals r.Id
                           where u.Id == request.UserId && u.DentalPracticeId == practice && u.IsActive
                               && r.Name == "LabTechnician"
                           select u.Id).AnyAsync(ct);
        if (!valid) return BadRequest(new { title = "Choose an active LabTechnician account belonging to this practice." });
        if (await _db.Set<LaboratoryMembership>().AnyAsync(m => m.LaboratoryPartnerId == id && m.UserId == request.UserId, ct))
            return Ok(new { message = "Already assigned." });
        _db.Set<LaboratoryMembership>().Add(new LaboratoryMembership
        { DentalPracticeId = practice, LaboratoryPartnerId = id, UserId = request.UserId });
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("LAB_PARTNER_ACCOUNT_ASSIGNED", "LaboratoryPartner", id.ToString(), ct: ct);
        return Ok(new { message = "Account restricted to assigned laboratory jobs." });
    }

    [HttpPost("orders")]
    [Authorize(Roles = "Dentist")]
    public async Task<IActionResult> Prescribe(NewOrder request, CancellationToken ct)
    {
        if (Practice is not Guid practice || Actor is not Guid actor) return Forbid();
        if (!Has(request.Instructions, 5000) || request.Items is null || request.Items.Count is < 1 or > 40 ||
            request.Items.Any(i => !Has(i.Procedure, 240) || !Has(i.ToothCode, 10)))
            return BadRequest(new { title = "Provide dentist instructions and 1–40 valid laboratory items." });
        if (!await _db.Patients.AnyAsync(p =>
                p.Id == request.PatientId && p.DentalPracticeId == practice && !p.IsArchived, ct)) return NotFound();
        if (!await _db.Set<LaboratoryPartner>().AnyAsync(l =>
                l.Id == request.LaboratoryPartnerId && l.DentalPracticeId == practice && l.IsActive, ct))
            return BadRequest(new { title = "Select an active laboratory for this practice." });
        if (request.TreatmentPlanId is Guid planId)
        {
            var plan = await _db.PatientTreatmentPlans.AsNoTracking().FirstOrDefaultAsync(p =>
                p.Id == planId && p.PatientId == request.PatientId &&
                p.DentalPracticeId == practice, ct);
            if (plan is null) return NotFound();
            if (plan.ConsentRecordedAtUtc == null)
                return Conflict(new { title = "A linked laboratory prescription requires recorded treatment-plan acknowledgement." });
            var requestedProcedures = await _db.PatientTreatmentProcedures.AsNoTracking()
                .Where(p => p.TreatmentPlanId == planId && p.DentalPracticeId == practice &&
                            p.PatientId == request.PatientId && p.RequiresLab &&
                            p.Status != "Cancelled" && p.Status != "Declined" && p.Status != "Completed")
                .Select(p => new { p.Description, p.ToothCode }).ToListAsync(ct);
            if (request.Items.Any(item => !requestedProcedures.Any(p =>
                    p.Description == item.Procedure.Trim() &&
                    p.ToothCode == item.ToothCode.Trim().ToUpperInvariant())))
                return BadRequest(new { title = "Every lab item must match an active, lab-required procedure on this patient's acknowledged treatment plan." });
            var alreadyPrescribed = await (
                from existingOrder in _db.Set<LaboratoryOrder>().AsNoTracking()
                join item in _db.Set<LaboratoryItem>().AsNoTracking() on existingOrder.Id equals item.LaboratoryOrderId
                where existingOrder.DentalPracticeId == practice && existingOrder.PatientId == request.PatientId &&
                      existingOrder.TreatmentPlanId == planId && existingOrder.Status != "Closed"
                select new { item.Procedure, item.ToothCode }).ToListAsync(ct);
            if (request.Items.Any(item => alreadyPrescribed.Any(p =>
                p.Procedure == item.Procedure.Trim() &&
                p.ToothCode == item.ToothCode.Trim().ToUpperInvariant())))
                return Conflict(new { title = "This procedure already has an open laboratory order. Open its existing case instead of prescribing twice." });
        }
        var order = new LaboratoryOrder { DentalPracticeId = practice, PatientId = request.PatientId,
            LaboratoryPartnerId = request.LaboratoryPartnerId, TreatmentPlanId = request.TreatmentPlanId,
            Instructions = Trim(request.Instructions), PrescribedByUserId = actor,
            // Sequential, human-friendly reference (LAB-00124) as in the guide; unique index guards races.
            Reference = "LAB-" + ((await _db.Set<LaboratoryOrder>().CountAsync(ct)) + 1).ToString("D5") };
        _db.Set<LaboratoryOrder>().Add(order);
        foreach (var i in request.Items)
            _db.Set<LaboratoryItem>().Add(new LaboratoryItem { DentalPracticeId = practice,
                LaboratoryOrderId = order.Id, Procedure = Trim(i.Procedure), ToothCode = Trim(i.ToothCode).ToUpperInvariant(),
                IsRemovable = i.IsRemovable });
        Log(order, "PRESCRIPTION_APPROVED", Trim(request.Instructions));
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("LAB_ORDER_CREATED", "LaboratoryOrder", order.Id.ToString(), ct: ct);
        return Ok(new { order.Id, order.Reference });
    }

    [HttpPost("manifests/prepare")]
    [Authorize(Roles = "PracticeAdmin,Receptionist,LabTechnician")]
    public async Task<IActionResult> Prepare(PrepareManifest request, CancellationToken ct)
    {
        if (Practice is not Guid practice) return Forbid();
        if (request.Direction is not ("ToLab" or "ToPractice") || request.ItemIds is null ||
            request.ItemIds.Count is < 1 or > 100 || request.ItemIds.Distinct().Count() != request.ItemIds.Count)
            return BadRequest(new { title = "Choose 1–100 unique items and a valid dispatch direction." });
        if (PartnerRole != (request.Direction == "ToPractice")) return Forbid();
        if (!await _db.Set<LaboratoryPartner>().AnyAsync(x => x.Id == request.LaboratoryPartnerId && x.IsActive, ct)) return NotFound();
        if (PartnerRole && !await _db.Set<LaboratoryMembership>().AnyAsync(
            x => x.LaboratoryPartnerId == request.LaboratoryPartnerId && x.UserId == Actor, ct)) return Forbid();
        var items = await _db.Set<LaboratoryItem>().Where(i => request.ItemIds.Contains(i.Id)).ToListAsync(ct);
        if (items.Count != request.ItemIds.Count) return NotFound();
        var orderIds = items.Select(i => i.LaboratoryOrderId).Distinct().ToList();
        var orders = await VisibleOrders().Where(o => orderIds.Contains(o.Id)).ToListAsync(ct);
        if (orders.Count != orderIds.Count || orders.Any(o => o.Status == "Closed" || o.LaboratoryPartnerId != request.LaboratoryPartnerId))
            return BadRequest(new { title = "Items must belong to open orders assigned to this one laboratory." });
        foreach (var i in items)
        {
            if (i.ActiveManifestId is not null) return Invalid("An item is already assigned to an active manifest.");
            if (request.Direction == "ToLab" && !(i.CustodyStatus == "AtPractice" &&
                (i.ManufacturingStatus == "AwaitingDispatch" || i.ManufacturingStatus == "CorrectionReady" || i.ManufacturingStatus == "RedoRequested")))
                return Invalid("Only awaiting, corrected or redo items physically at practice may be dispatched to the lab.");
            if (request.Direction == "ToPractice" && !(i.CustodyStatus == "AtLab" && i.ManufacturingStatus == "Complete"))
                return Invalid("Only completed items physically at the lab may be returned.");
        }
        var manifest = new LaboratoryManifest { DentalPracticeId = practice,
            LaboratoryPartnerId = request.LaboratoryPartnerId, Direction = request.Direction,
            // PL-0627 for practice-to-lab, PL-OUT-0041 for lab-to-practice (numbered per direction).
            Reference = (request.Direction == "ToLab" ? "PL-" : "PL-OUT-") +
                ((await _db.Set<LaboratoryManifest>().CountAsync(x => x.Direction == request.Direction, ct)) + 1).ToString("D4") };
        _db.Set<LaboratoryManifest>().Add(manifest);
        foreach (var i in items)
        {
            i.ActiveManifestId = manifest.Id; // reserved; physically remains where it is
            _db.Set<LaboratoryManifestLine>().Add(new LaboratoryManifestLine {
                DentalPracticeId = practice, LaboratoryManifestId = manifest.Id, LaboratoryItemId = i.Id });
            Log(orders.First(o => o.Id == i.LaboratoryOrderId), "MANIFEST_PREPARED",
                manifest.Reference + " (not physically collected)", i.Id, manifest.Id);
        }
        await _db.SaveChangesAsync(ct);
        return Ok(new { manifest.Id, manifest.Reference });
    }

    [HttpPost("manifests/{id:guid}/handover")]
    [Authorize(Roles = "PracticeAdmin,Receptionist,LabTechnician")]
    public async Task<IActionResult> Handover(Guid id, HandoverRequest request, CancellationToken ct)
    {
        var m = await Manifest(id, ct); if (m is null) return NotFound();
        if (PartnerRole != (m.Direction == "ToPractice")) return Forbid();
        if (m.Status != "Prepared") return Invalid("This physical handover is already recorded.");
        if (!Has(request.CollectorName, 140) || !Has(request.Acknowledgement, 300) ||
            request.PackageCount is < 1 or > 1000 || request.Waybill?.Length > 120)
            return BadRequest(new { title = "Collector, package count and handover acknowledgement are required." });
        var lines = await _db.Set<LaboratoryManifestLine>().Where(l => l.LaboratoryManifestId == id).ToListAsync(ct);
        var itemIds = lines.Select(l => l.LaboratoryItemId).ToList();
        var items = await _db.Set<LaboratoryItem>().Where(i => itemIds.Contains(i.Id)).ToListAsync(ct);
        m.Status = "Dispatched"; m.CollectorName = Trim(request.CollectorName);
        m.Acknowledgement = Trim(request.Acknowledgement); m.PackageCount = request.PackageCount;
        m.Waybill = Trim(request.Waybill); m.HandedOverAtUtc = DateTime.UtcNow;
        foreach (var item in items)
        {
            if (item.ActiveManifestId != id) return Invalid("Manifest reservation mismatch.");
            item.CustodyStatus = m.Direction == "ToLab" ? "InTransitToLab" : "InTransitToPractice";
            var order = await Order(item.LaboratoryOrderId, ct);
            if (order is not null) Log(order, "PHYSICAL_HANDOVER", $"{m.Reference}; collector {m.CollectorName}; {m.Waybill}", item.Id, m.Id);
        }
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("LAB_PHYSICAL_HANDOVER", "LaboratoryManifest", id.ToString(), ct: ct);
        return Ok(new { m.Status });
    }

    [HttpPost("manifests/{id:guid}/receive")]
    [Authorize(Roles = "PracticeAdmin,Receptionist,LabTechnician")]
    public async Task<IActionResult> Receive(Guid id, ReceiveRequest request, CancellationToken ct)
    {
        var m = await Manifest(id, ct); if (m is null) return NotFound();
        if (PartnerRole != (m.Direction == "ToLab")) return Forbid();
        if (m.Status is not ("Dispatched" or "PartiallyReceived")) return Invalid("Manifest must be physically dispatched first.");
        if (!Has(request.ReceiverName, 140) || request.Discrepancy?.Length > 2000 ||
            request.ReceivedItemIds is null || request.ReceivedItemIds.Count > 100)
            return BadRequest(new { title = "Receiver and received item identifiers are required." });
        var lines = await _db.Set<LaboratoryManifestLine>().Where(l => l.LaboratoryManifestId == id).ToListAsync(ct);
        var selected = request.ReceivedItemIds.Distinct().ToHashSet();
        if (selected.Any(x => !lines.Any(l => l.LaboratoryItemId == x)))
            return BadRequest(new { title = "Received items must belong to this manifest." });
        if (selected.Count == 0 && string.IsNullOrWhiteSpace(request.Discrepancy))
            return BadRequest(new { title = "Record received pieces or a discrepancy." });
        var changed = 0;
        foreach (var line in lines.Where(l => selected.Contains(l.LaboratoryItemId) && l.ReceivedAtUtc is null))
        {
            var item = await Item(line.LaboratoryItemId, ct);
            if (item is null || item.ActiveManifestId != m.Id) return Invalid("Item custody does not match manifest.");
            if (item.CustodyStatus != (m.Direction == "ToLab" ? "InTransitToLab" : "InTransitToPractice"))
                return Invalid("Item is not in transit for this direction.");
            line.ReceivedAtUtc = DateTime.UtcNow; item.ActiveManifestId = null;
            item.CustodyStatus = m.Direction == "ToLab" ? "AtLab" : "AtPractice";
            if (m.Direction == "ToLab") item.ManufacturingStatus = "AwaitingInspection";
            else
            {
                item.QaStatus = "Pending";
                // A redo that has physically come back is finished as a cycle (history is kept),
                // so a later failure can start a new redo without being blocked.
                var openRedos = await _db.Set<LaboratoryCorrection>()
                    .Where(c => c.LaboratoryItemId == item.Id && c.Kind == "Redo" && c.Status != "Resolved").ToListAsync(ct);
                foreach (var redo in openRedos) { redo.Status = "Resolved"; redo.ResolvedAtUtc = DateTime.UtcNow; }
            }
            var order = await Order(item.LaboratoryOrderId, ct);
            if (order is not null) Log(order, "PHYSICAL_RECEIPT", $"{m.Reference}; receiver {Trim(request.ReceiverName)}", item.Id, m.Id);
            changed++;
        }
        if (changed == 0 && Trim(request.Discrepancy) == Trim(m.Discrepancy))
            return Invalid("No new receipt or discrepancy to record.");
        m.ReceiverName = Trim(request.ReceiverName);
        m.Discrepancy = Trim(request.Discrepancy);
        m.Status = lines.All(l => l.ReceivedAtUtc is not null) ? "Received" : "PartiallyReceived";
        if (m.Status == "Received") m.ReceivedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("LAB_MANIFEST_RECEIPT", "LaboratoryManifest", id.ToString(), ct: ct);
        return Ok(new { m.Status, newlyReceived = changed });
    }

    [HttpPost("items/{id:guid}/intake")]
    [Authorize(Roles = "LabTechnician")]
    public async Task<IActionResult> Intake(Guid id, IntakeRequest request, CancellationToken ct)
    {
        var item = await Item(id, ct); if (item is null) return NotFound();
        var order = await Order(item.LaboratoryOrderId, ct); if (order is null) return NotFound();
        if (item.CustodyStatus != "AtLab" || item.ManufacturingStatus != "AwaitingInspection")
            return Invalid("Record physical laboratory receipt before inspecting an item.");
        if (request.Decision is not ("Accept" or "Reject") || !Has(request.Notes, 2000))
            return BadRequest(new { title = "Accept or reject and record technical inspection findings." });
        if (request.Decision == "Accept")
        {
            item.ManufacturingStatus = "Accepted";
            var cycle = await _db.Set<LaboratoryCorrection>()
                .Where(c => c.LaboratoryItemId == id && c.Status != "Resolved")
                .OrderByDescending(c => c.CreatedAtUtc).FirstOrDefaultAsync(ct);
            if (cycle is { Kind: "ImpressionCorrection" }) { cycle.Status = "Resolved"; cycle.ResolvedAtUtc = DateTime.UtcNow; }
        }
        else
        {
            item.ManufacturingStatus = "CorrectionRequired";
            item.CorrectionCount++;
            _db.Set<LaboratoryCorrection>().Add(new LaboratoryCorrection {
                DentalPracticeId = order.DentalPracticeId, LaboratoryItemId = id,
                Kind = "ImpressionCorrection", Reason = Trim(request.Notes),
                Instructions = "Dentist must record a replacement impression or scan.",
                RequestedByUserId = Actor!.Value
            });
        }
        Log(order, request.Decision == "Accept" ? "LAB_INTAKE_ACCEPTED" : "LAB_IMPRESSION_REJECTED", Trim(request.Notes), id);
        await _db.SaveChangesAsync(ct);
        return Ok(new { item.ManufacturingStatus });
    }

    [HttpPost("items/{id:guid}/impression-correction")]
    [Authorize(Roles = "Dentist")]
    public async Task<IActionResult> CorrectImpression(Guid id, ImpressionRequest request, CancellationToken ct)
    {
        var item = await Item(id, ct); if (item is null) return NotFound();
        var order = await Order(item.LaboratoryOrderId, ct); if (order is null) return NotFound();
        if (item.ManufacturingStatus != "CorrectionRequired" || !Has(request.Notes, 3000))
            return Invalid("Record replacement impression only after lab rejection and actual completion.");
        var cycle = await _db.Set<LaboratoryCorrection>().Where(c => c.LaboratoryItemId == id &&
            c.Kind == "ImpressionCorrection" && c.Status == "Requested").OrderByDescending(c => c.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);
        if (cycle is null) return Invalid("No pending rejected impression.");
        item.ManufacturingStatus = "CorrectionReady";
        item.CustodyStatus = "AtPractice"; // new physical impression is at practice; original rejected piece remains in lab history
        cycle.Status = "ReplacementPrepared";
        Log(order, "NEW_IMPRESSION_TAKEN", Trim(request.Notes), id);
        await _db.SaveChangesAsync(ct);
        return Ok(new { item.ManufacturingStatus });
    }

    [HttpPost("items/{id:guid}/production")]
    [Authorize(Roles = "LabTechnician")]
    public async Task<IActionResult> Production(Guid id, ProductionRequest request, CancellationToken ct)
    {
        var item = await Item(id, ct); if (item is null) return NotFound();
        var order = await Order(item.LaboratoryOrderId, ct); if (order is null) return NotFound();
        if (item.CustodyStatus != "AtLab") return Invalid("Production may only be recorded for items at the laboratory.");
        if (!Has(request.Notes, 2000)) return BadRequest(new { title = "Record workmanship notes or a delay reason." });
        var allowed = (item.ManufacturingStatus, request.Stage) switch {
            ("Accepted", "InProduction") => true,
            ("InProduction", "Complete") => true,
            ("InProduction", "Delayed") => true,
            ("Delayed", "InProduction") => true,
            _ => false
        };
        if (!allowed) return Invalid("Invalid production transition; accept intake first, then produce and complete.");
        item.ManufacturingStatus = request.Stage;
        item.ExpectedAtUtc = request.ExpectedAtUtc;
        Log(order, "LAB_PRODUCTION_" + request.Stage.ToUpperInvariant(), Trim(request.Notes), id);
        await _db.SaveChangesAsync(ct);
        return Ok(new { item.ManufacturingStatus });
    }

    [HttpPost("items/{id:guid}/qa")]
    [Authorize(Roles = "Dentist")]
    public async Task<IActionResult> Qa(Guid id, QaRequest request, CancellationToken ct)
    {
        var item = await Item(id, ct); if (item is null) return NotFound();
        var order = await Order(item.LaboratoryOrderId, ct); if (order is null) return NotFound();
        if (item.CustodyStatus != "AtPractice" || item.ManufacturingStatus != "Complete" || item.QaStatus != "Pending")
            return Invalid("Physical receipt and manufacturing completion are required before an authorised QA decision.");
        if (!Has(request.Notes, 2000)) return BadRequest(new { title = "Document actual QA findings." });
        item.QaStatus = request.Passed ? "Passed" : "Failed";
        Log(order, request.Passed ? "PRACTICE_QA_PASSED" : "PRACTICE_QA_FAILED", Trim(request.Notes), id);
        await _db.SaveChangesAsync(ct);
        return Ok(new { item.QaStatus });
    }

    [HttpPost("items/{id:guid}/fit")]
    [Authorize(Roles = "Dentist")]
    public async Task<IActionResult> Fit(Guid id, FitRequest request, CancellationToken ct)
    {
        var item = await Item(id, ct); if (item is null) return NotFound();
        var order = await Order(item.LaboratoryOrderId, ct); if (order is null) return NotFound();
        if (item.CustodyStatus != "AtPractice" || item.QaStatus != "Passed" ||
            item.ClinicalStatus == "Completed" || item.ManufacturingStatus != "Complete")
            return Invalid("Only uncompleted, QA-passed items physically at the practice may be fitted.");
        if (request.Outcome is not ("Fitted" or "NotFitted") || !Has(request.Notes, 2000) || request.GuaranteeNote?.Length > 1000)
            return BadRequest(new { title = "Record fitment outcome and clinical findings; any guarantee must be expressly agreed." });
        item.ClinicalStatus = request.Outcome == "Fitted" ? "Completed" : "NotFitted";
        if (request.Outcome == "Fitted")
        {
            item.CompletedAtUtc = DateTime.UtcNow;
            item.GuaranteeNote = Trim(request.GuaranteeNote);
            // New append-only dental-chart observation. Does not overwrite historical charting.
            if (item.ToothCode.Length == 2 && item.ToothCode.All(char.IsDigit))
                _db.DentalChartEntries.Add(new DentalChartEntry {
                    DentalPracticeId = order.DentalPracticeId, PatientId = order.PatientId,
                    RecordedByUserId = Actor!.Value, ToothCode = item.ToothCode,
                    Surface = "Whole Tooth", Finding = "Restoration present",
                    Notes = "Lab " + order.Reference + ": " + item.Procedure + ". " + Trim(request.Notes)
                });
        }
        Log(order, request.Outcome == "Fitted" ? "CLINICAL_FITMENT_ACCEPTED" : "CLINICAL_FITMENT_FAILED", Trim(request.Notes), id);
        await _db.SaveChangesAsync(ct);
        await RefreshOrder(order.Id, ct);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("LAB_CLINICAL_FITMENT", "LaboratoryItem", id.ToString(), ct: ct);
        return Ok(new { item.ClinicalStatus });
    }

    [HttpPost("items/{id:guid}/redo")]
    [Authorize(Roles = "Dentist")]
    public async Task<IActionResult> Redo(Guid id, ReturnRequest request, CancellationToken ct)
    {
        var item = await Item(id, ct); if (item is null) return NotFound();
        var order = await Order(item.LaboratoryOrderId, ct); if (order is null) return NotFound();
        if (item.ClinicalStatus == "Completed" || item.CustodyStatus != "AtPractice" ||
            !(item.QaStatus == "Failed" || item.ClinicalStatus == "NotFitted"))
            return Invalid("A redo must follow documented QA or fitment failure; completed items are protected.");
        if (item.ActiveManifestId is not null) return Invalid("An active manifest already exists for this item.");
        if (await _db.Set<LaboratoryCorrection>().AnyAsync(c => c.LaboratoryItemId == id &&
            c.Kind == "Redo" && c.Status != "Resolved", ct)) return Invalid("This item already has an open redo.");
        if (!Has(request.Reason, 2000) || !Has(request.Instructions, 3000) ||
            request.Priority is not ("Standard" or "Urgent"))
            return BadRequest(new { title = "Dentist reason, instructions and priority are required." });
        item.ManufacturingStatus = "RedoRequested"; item.CorrectionCount++;
        _db.Set<LaboratoryCorrection>().Add(new LaboratoryCorrection {
            DentalPracticeId = order.DentalPracticeId, LaboratoryItemId = id, Kind = "Redo",
            Reason = Trim(request.Reason), Instructions = Trim(request.Instructions),
            Priority = request.Priority, DueAtUtc = request.DueAtUtc,
            RequestedByUserId = Actor!.Value
        });
        Log(order, "DENTIST_REDO_REQUESTED", Trim(request.Reason) + "; " + Trim(request.Instructions), id);
        await _db.SaveChangesAsync(ct);
        return Ok(new { item.ManufacturingStatus });
    }

    [HttpPost("items/{id:guid}/patient-handover")]
    [Authorize(Roles = "Dentist,PracticeAdmin")]
    public async Task<IActionResult> PatientHandover(Guid id, PatientHandoverRequest request, CancellationToken ct)
    {
        var item = await Item(id, ct); if (item is null) return NotFound();
        var order = await Order(item.LaboratoryOrderId, ct); if (order is null) return NotFound();
        if (!item.IsRemovable || item.ClinicalStatus != "Completed" || item.PatientHandedOverAtUtc is not null)
            return Invalid("Patient handover applies only to completed removable items not previously handed over.");
        if (!Has(request.ReceivedByName, 160) || request.Notes?.Length > 1000)
            return BadRequest(new { title = "Record who actually received the removable appliance." });
        item.PatientHandedOverAtUtc = DateTime.UtcNow;
        Log(order, "PATIENT_HANDOVER_CONFIRMED", Trim(request.ReceivedByName) + "; " + Trim(request.Notes), id);
        await _db.SaveChangesAsync(ct);
        return Ok(new { item.PatientHandedOverAtUtc });
    }

    [HttpPost("orders/{id:guid}/close")]
    [Authorize(Roles = "Dentist")]
    public async Task<IActionResult> Close(Guid id, CancellationToken ct)
    {
        var order = await Order(id, ct); if (order is null) return NotFound();
        if (order.Status == "Closed") return Invalid("Order already clinically closed.");
        var items = await _db.Set<LaboratoryItem>().Where(i => i.LaboratoryOrderId == id).ToListAsync(ct);
        if (items.Count == 0 || items.Any(i => i.ClinicalStatus != "Completed" || i.QaStatus != "Passed" ||
             i.ActiveManifestId != null || i.CustodyStatus != "AtPractice" ||
             (i.IsRemovable && i.PatientHandedOverAtUtc is null)))
            return Invalid("All items must be QA-passed, clinically fitted, out of transit, and removable items handed to patient.");
        var itemIds = items.Select(i => i.Id).ToList();
        var cycles = await _db.Set<LaboratoryCorrection>().Where(c => itemIds.Contains(c.LaboratoryItemId) && c.Status != "Resolved").ToListAsync(ct);
        // Final fitted result resolves the original redo without deleting the history.
        foreach (var cycle in cycles.Where(c => c.Kind == "Redo"))
        { cycle.Status = "Resolved"; cycle.ResolvedAtUtc = DateTime.UtcNow; }
        if (cycles.Any(c => c.Kind != "Redo")) return Invalid("Resolve the outstanding rejected impression first.");
        order.Status = "Closed"; order.ClosedAtUtc = DateTime.UtcNow;
        Log(order, "CLINICAL_ORDER_CLOSED", "Dentist verified all original items; no financial charge generated.");
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("LAB_ORDER_CLINICALLY_CLOSED", "LaboratoryOrder", id.ToString(), ct: ct);
        return Ok(new { order.Status, order.ClosedAtUtc });
    }

    [HttpPost("items/{id:guid}/evidence")]
    [Authorize(Roles = "Dentist,LabTechnician")]
    [RequestSizeLimit(9_000_000)]
    public async Task<IActionResult> EvidenceUpload(Guid id, [FromForm] IFormFile file, CancellationToken ct)
    {
        var item = await Item(id, ct); if (item is null) return NotFound();
        var order = await Order(item.LaboratoryOrderId, ct); if (order is null) return NotFound();
        if (file is null || file.Length is < 1 or > 8_000_000)
            return BadRequest(new { title = "Choose a JPG, PNG or PDF under 8 MB." });
        byte[] bytes;
        await using (var buffer = new MemoryStream()) { await file.CopyToAsync(buffer, ct); bytes = buffer.ToArray(); }
        var jpeg = bytes.Length > 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff;
        var png = bytes.Length > 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] {137,80,78,71,13,10,26,10});
        var pdf = bytes.Length > 5 && Encoding.ASCII.GetString(bytes, 0, 5) == "%PDF-";
        var mime = jpeg ? "image/jpeg" : png ? "image/png" : pdf ? "application/pdf" : null;
        if (mime is null) return BadRequest(new { title = "Invalid file signature; JPG, PNG and PDF only." });
        var doc = new LaboratoryEvidence { DentalPracticeId = order.DentalPracticeId,
            LaboratoryItemId = id, LaboratoryOrderId = order.Id, UploadedByUserId = Actor!.Value,
            ContentType = mime, FileName = Path.GetFileName(file.FileName)[..Math.Min(Path.GetFileName(file.FileName).Length, 180)], Bytes = bytes };
        _db.Set<LaboratoryEvidence>().Add(doc);
        Log(order, "CLINICAL_EVIDENCE_ATTACHED", mime + "; file " + doc.Id, id);
        await _db.SaveChangesAsync(ct);
        return Ok(new { doc.Id, doc.FileName, doc.ContentType });
    }

    [HttpGet("evidence/{id:guid}/preview")]
    public async Task<IActionResult> EvidenceImagePreview(Guid id, CancellationToken ct)
    {
        var evidence = await _db.Set<LaboratoryEvidence>().AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, ct);
        if (evidence is null || await Order(evidence.LaboratoryOrderId, ct) is null) return NotFound();
        if (evidence.ContentType is not ("image/jpeg" or "image/png")) return BadRequest(new { title = "Preview is available only for safe image types." });
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(evidence.Bytes, evidence.ContentType);
    }

    [HttpGet("evidence/{id:guid}")]
    public async Task<IActionResult> EvidenceDownload(Guid id, CancellationToken ct)
    {
        var evidence = await _db.Set<LaboratoryEvidence>().AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, ct);
        if (evidence is null || await Order(evidence.LaboratoryOrderId, ct) is null) return NotFound();
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        await _audit.WriteAsync("LAB_EVIDENCE_VIEWED", "LaboratoryEvidence", id.ToString(), ct: ct);
        return File(evidence.Bytes, evidence.ContentType, evidence.FileName);
    }
}
