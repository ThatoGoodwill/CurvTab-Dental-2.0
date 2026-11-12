using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Identity;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CurvTabDental.API.Controllers;

/// <summary>
/// Phase 1 orthodontic intake and specialist routing. Uses the existing patient ID.
/// No endpoint here creates a treatment agreement, invoice, payment or instalment.
/// </summary>
[ApiController]
[Route("api/orthodontics/intakes")]
[Authorize(Roles = "PracticeAdmin,Receptionist,Dentist,Orthodontist")]
public sealed class OrthodonticIntakesController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;
    private readonly IConfiguration _settings;

    public OrthodonticIntakesController(DentalDbContext db, ICurrentUser current, IAuditService audit, IConfiguration settings)
    {
        _db = db; _current = current; _audit = audit; _settings = settings;
    }

    public record CreateIntakeRequest(
        Guid PatientId, string Source, string? ReferralReason, string? ReferralNotes,
        string? PreviousProvider, string? ExistingAppliances,
        DateOnly? PreviousTreatmentStartDate, string? PreviousTreatmentPlanSummary,
        string? TransferReason, string? PreviousRecordsSummary, string? UrgentConcerns);

    public record AssignRequest(Guid OrthodontistUserId);
    public record ReviewRequest(bool HistoryVerified, string? MissingDocumentsJson,
        string? DocumentReferencesJson, string? NextAction, DateOnly? DueDate);
    public record AdvancePolicyRequest(string Policy, string Reason);
    public record TermsSignatureRequest(string Version, string SignerName,
        string SignerCapacity, string SignatureDataUrl, string AcceptanceMethod);

    private bool Manager => _current.Role == StaffRoles.PracticeAdmin;
    private bool Reception => _current.Role == StaffRoles.Receptionist;
    private bool Dentist => _current.Role == StaffRoles.Dentist;
    private bool Specialist => Dentist || _current.Role == StaffRoles.Orthodontist;

    private IQueryable<OrthodonticIntakeCase> Visible()
    {
        var query = _db.OrthodonticIntakes.AsNoTracking();
        // Only the explicitly assigned clinician sees clinical cases. Managers
        // can route unassigned cases; reception can prepare missing intake data.
        if (Specialist) query = query.Where(x => x.AssignedOrthodontistUserId == _current.UserId);
        return query;
    }

    private static object Summary(OrthodonticIntakeCase x, string patientName) => new
    {
        x.Id, x.PatientId, PatientName = patientName, x.Source, x.Status,
        x.AssignedOrthodontistUserId, x.ReferralAuthorUserId, x.CreatedAtUtc,
        x.NextAction, x.DueDate, x.MissingDocumentsJson,
        x.AdvancePolicy, x.TermsApplicable, x.TermsAcceptedAtUtc,
        x.HistoryVerifiedByClinician,
        // A payment flag, never an inferred amount or unrestricted ledger.
        AdvanceRecorded = x.AdvancePaymentId.HasValue,
        x.UrgentConcerns
    };

    [HttpGet]
    public async Task<IActionResult> Queue(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var result = await (
            from intake in Visible()
            join patient in _db.Patients.AsNoTracking() on intake.PatientId equals patient.Id
            where intake.DentalPracticeId == practiceId &&
                  patient.DentalPracticeId == practiceId && !patient.IsArchived &&
                  intake.ClosedAtUtc == null
            orderby intake.DueDate, intake.CreatedAtUtc
            select new { Case = intake, PatientName = patient.FirstName + " " + patient.LastName }
        ).Take(250).ToListAsync(ct);
        return Ok(result.Select(x => Summary(x.Case, x.PatientName)));
    }

    // The specialist dropdown must not reuse the unrestricted /api/patients
    // endpoint, because that would leak unrelated general dentistry patients.
    [HttpGet("patients")]
    public async Task<IActionResult> Patients(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var patients = await (
            from intake in Visible()
            join patient in _db.Patients.AsNoTracking() on intake.PatientId equals patient.Id
            where intake.DentalPracticeId == practiceId && patient.DentalPracticeId == practiceId &&
                  intake.ClosedAtUtc == null && !patient.IsArchived
            orderby patient.LastName, patient.FirstName
            select new { id = patient.Id, name = patient.FirstName + " " + patient.LastName }
        ).Distinct().Take(250).ToListAsync(ct);
        return Ok(patients);
    }

    [HttpGet("clinicians")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Clinicians(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var clinicians = await (
            from u in _db.Users.AsNoTracking()
            join ur in _db.UserRoles.AsNoTracking() on u.Id equals ur.UserId
            join role in _db.Roles.AsNoTracking() on ur.RoleId equals role.Id
            where u.DentalPracticeId == practiceId && u.IsActive && (role.Name == StaffRoles.Orthodontist || role.Name == StaffRoles.Dentist)
            orderby u.FullName
            select new { id = u.Id, name = u.FullName }
        ).ToListAsync(ct);
        return Ok(clinicians);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateIntakeRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid actor) return Unauthorized();
        var source = req.Source?.Trim().ToUpperInvariant() ?? "";
        if (source is not ("DIRECT" or "INTERNAL" or "TRANSFER_IN"))
            return BadRequest(new { message = "Choose direct, internal referral or transfer-in." });
        if (source == "INTERNAL" && !Dentist)
            return Forbid();
        if (source == "TRANSFER_IN" &&
            (string.IsNullOrWhiteSpace(req.PreviousProvider) ||
             string.IsNullOrWhiteSpace(req.TransferReason)))
            return BadRequest(new { message = "Former provider and reason for transfer are required." });
        if (source == "INTERNAL" && string.IsNullOrWhiteSpace(req.ReferralReason))
            return BadRequest(new { message = "Enter the internal referral reason." });

        var patient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(
            p => p.Id == req.PatientId && p.DentalPracticeId == practiceId && !p.IsArchived, ct);
        if (patient is null) return NotFound(new { message = "Select an existing patient in this practice." });
        if (source == "DIRECT")
        {
            var profile = await _db.PatientRegistrationDetails.AsNoTracking()
                .Where(r => r.DentalPracticeId == practiceId && r.PatientId == patient.Id)
                .Select(r => r.ProfileJson).FirstOrDefaultAsync(ct);
            if (!IsClassified(profile))
                return Conflict(new { message = "Direct intake requires the existing Orthodontic patient classification in registration. Use an internal referral for an existing general patient." });
        }
        if (await _db.OrthodonticIntakes.AnyAsync(x => x.PatientId == patient.Id && x.ClosedAtUtc == null, ct))
            return Conflict(new { message = "There is already an open orthodontic intake for this patient." });

        var entity = new OrthodonticIntakeCase
        {
            DentalPracticeId = practiceId,
            PatientId = patient.Id,
            CreatedByUserId = actor,
            ReferralAuthorUserId = source == "INTERNAL" ? actor : null,
            Source = source,
            Status = "RECORDS_PENDING",
            ReferralReason = Clean(req.ReferralReason, 1000),
            ReferralNotes = Clean(req.ReferralNotes, 4000),
            PreviousProvider = Clean(req.PreviousProvider, 250),
            ExistingAppliances = Clean(req.ExistingAppliances, 1000),
            PreviousTreatmentStartDate = req.PreviousTreatmentStartDate,
            PreviousTreatmentPlanSummary = Clean(req.PreviousTreatmentPlanSummary, 4000),
            TransferReason = Clean(req.TransferReason, 2000),
            PreviousRecordsSummary = Clean(req.PreviousRecordsSummary, 4000),
            UrgentConcerns = Clean(req.UrgentConcerns, 2000),
            TermsApplicable = source == "DIRECT",
            AdvancePolicy = source == "DIRECT" ? "STANDARD_R2500" : "REVIEW_REQUIRED",
            MissingDocumentsJson = JsonSerializer.Serialize(source == "TRANSFER_IN"
                ? new[] { "Previous clinical records", "X-rays/photos", "Guardian/payer review", "Independent specialist acceptance review" }
                : new[] { "Orthodontic clinical history review", "Guardian/payer review", "Clinical documents" }),
            NextAction = source == "TRANSFER_IN"
                ? "Orthodontist must independently assess transferred treatment; do not adopt previous plan or debt."
                : "Assign a specialist and complete orthodontic intake readiness."
        };
        _db.OrthodonticIntakes.Add(entity);
        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            return Conflict(new { message = "An open intake was created concurrently. Refresh instead of creating a duplicate." });
        }
        await _audit.WriteAsync("ORTHO_INTAKE_CREATED", "OrthodonticIntakeCase", entity.Id.ToString(),
            detail: $"source={source};patient={patient.Id};no_payment_or_treatment_created", ct: ct);
        return Created($"/api/orthodontics/intakes/{entity.Id}", Summary(entity, patient.FirstName + " " + patient.LastName));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Details(Guid id, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var entity = await Visible().FirstOrDefaultAsync(x => x.Id == id && x.DentalPracticeId == practiceId, ct);
        if (entity is null) return NotFound();
        await _audit.WriteAsync("ORTHO_INTAKE_VIEWED", "OrthodonticIntakeCase", id.ToString(), ct: ct);
        // Never send the captured signature PNG or full legal text as part of
        // generic case details; retrieve signed documents through audited routes.
        return Ok(new {
            entity.Id, entity.PatientId, entity.DentalPracticeId, entity.Source, entity.Status,
            entity.CreatedByUserId, entity.ReferralAuthorUserId, entity.AssignedOrthodontistUserId,
            entity.ReferralReason, entity.ReferralNotes, entity.PreviousProvider,
            entity.ExistingAppliances, entity.PreviousTreatmentStartDate,
            entity.PreviousTreatmentPlanSummary, entity.TransferReason,
            entity.PreviousRecordsSummary, entity.UrgentConcerns,
            entity.DocumentReferencesJson, entity.MissingDocumentsJson,
            entity.HistoryVerifiedByClinician, entity.HistoryVerifiedAtUtc,
            entity.TermsApplicable, entity.TermsVersion, entity.TermsSha256,
            entity.TermsSignerName, entity.TermsSignerCapacity, entity.TermsAcceptedAtUtc,
            entity.AdvancePolicy, AdvanceRecorded = entity.AdvancePaymentId.HasValue,
            entity.NextAction, entity.DueDate, entity.CreatedAtUtc, entity.UpdatedAtUtc,
            entity.AssessmentStartedAtUtc
        });
    }

    [HttpPatch("{id:guid}/assign")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> Assign(Guid id, [FromBody] AssignRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var valid = await (
            from user in _db.Users
            join ur in _db.UserRoles on user.Id equals ur.UserId
            join role in _db.Roles on ur.RoleId equals role.Id
            where user.Id == req.OrthodontistUserId && user.DentalPracticeId == practiceId &&
                  user.IsActive && (role.Name == StaffRoles.Orthodontist || role.Name == StaffRoles.Dentist)
            select user.Id
        ).AnyAsync(ct);
        if (!valid) return BadRequest(new { message = "Select an active orthodontist or authorised specialist dentist in this practice." });
        var intake = await _db.OrthodonticIntakes.FirstOrDefaultAsync(x =>
            x.Id == id && x.DentalPracticeId == practiceId && x.ClosedAtUtc == null, ct);
        if (intake is null) return NotFound();
        intake.AssignedOrthodontistUserId = req.OrthodontistUserId;
        intake.UpdatedAtUtc = DateTime.UtcNow;
        intake.NextAction = "Assigned specialist to review medical history, documents, consent and readiness.";
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHO_INTAKE_ASSIGNED", "OrthodonticIntakeCase", id.ToString(),
            detail: $"assigned_user={req.OrthodontistUserId}", ct: ct);
        return Ok(new { intake.Id, intake.AssignedOrthodontistUserId });
    }

    [HttpPatch("{id:guid}/review")]
    [Authorize(Roles = "Dentist,Orthodontist")]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId || _current.UserId is not Guid clinician) return Forbid();
        var intake = await _db.OrthodonticIntakes.FirstOrDefaultAsync(x =>
            x.Id == id && x.DentalPracticeId == practiceId && x.AssignedOrthodontistUserId == clinician &&
            x.ClosedAtUtc == null, ct);
        if (intake is null) return NotFound();
        if (!ValidListJson(req.MissingDocumentsJson) || !ValidListJson(req.DocumentReferencesJson))
            return BadRequest(new { message = "Document checklists must contain JSON arrays of short text references." });

        intake.HistoryVerifiedByClinician = req.HistoryVerified;
        intake.HistoryVerifiedByUserId = req.HistoryVerified ? clinician : null;
        intake.HistoryVerifiedAtUtc = req.HistoryVerified ? DateTime.UtcNow : null;
        if (req.MissingDocumentsJson != null) intake.MissingDocumentsJson = req.MissingDocumentsJson;
        if (req.DocumentReferencesJson != null) intake.DocumentReferencesJson = req.DocumentReferencesJson;
        intake.NextAction = Clean(req.NextAction, 500);
        intake.DueDate = req.DueDate;
        intake.UpdatedAtUtc = DateTime.UtcNow;

        var missing = JsonSerializer.Deserialize<string[]>(intake.MissingDocumentsJson) ?? [];
        // A typed checklist alone cannot prove that an X-ray, referral or
        // other specialist record has really been uploaded and reviewed.
        var hasEvidence = await _db.OrthodonticIntakeDocuments.AsNoTracking()
            .AnyAsync(x => x.IntakeId == intake.Id && x.PatientId == intake.PatientId &&
                           x.DentalPracticeId == practiceId, ct);

        // Once assessment starts, do not silently return it to intake
        // merely because a clinician amends the document checklist.
        if (intake.Status != "ASSESSMENT_IN_PROGRESS")
            intake.Status = !req.HistoryVerified || missing.Length > 0 || !hasEvidence
            ? "RECORDS_PENDING"
            : intake.TermsApplicable && intake.TermsAcceptedAtUtc is null
                ? "TERMS_PENDING"
                : intake.AdvancePolicy == "REVIEW_REQUIRED"
                    ? "RECORDS_PENDING"
                    : intake.AdvancePolicy == "STANDARD_R2500" && !intake.AdvancePaymentId.HasValue
                        ? "PAYMENT_PENDING"
                        : "ASSESSMENT_READY";
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHO_INTAKE_REVIEWED", "OrthodonticIntakeCase", id.ToString(),
            detail: $"status={intake.Status};history_verified={req.HistoryVerified};missing_count={missing.Length};has_uploaded_evidence={hasEvidence}", ct: ct);
        return Ok(new { intake.Id, intake.Status });
    }

    [HttpPatch("{id:guid}/advance-policy")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> AdvancePolicy(Guid id, [FromBody] AdvancePolicyRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (req.Policy is not ("STANDARD_R2500" or "NOT_APPLICABLE" or "REVIEW_REQUIRED") ||
            string.IsNullOrWhiteSpace(req.Reason) || req.Reason.Length > 500)
            return BadRequest(new { message = "Choose the applicable policy and record its reason." });
        var intake = await _db.OrthodonticIntakes.FirstOrDefaultAsync(x => x.Id == id && x.DentalPracticeId == practiceId && x.ClosedAtUtc == null, ct);
        if (intake is null) return NotFound();
        intake.AdvancePolicy = req.Policy;
        intake.TermsApplicable = req.Policy == "STANDARD_R2500";
        intake.Status = "RECORDS_PENDING";
        intake.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHO_ADVANCE_POLICY_REVIEWED", "OrthodonticIntakeCase", id.ToString(),
            detail: $"policy={req.Policy};reason={req.Reason}", ct: ct);
        return Ok(new { intake.Id, intake.AdvancePolicy, intake.TermsApplicable });
    }

    // A legal reviewer must publish an APPROVED version and exact immutable
    // full text via secure configuration. This endpoint cannot invent wording.
    [HttpGet("approved-terms")]
    public IActionResult ApprovedTerms()
    {
        var version = _settings["Orthodontics:ApprovedIntakeTermsVersion"];
        var text = _settings["Orthodontics:ApprovedIntakeTermsText"];
        if (string.IsNullOrWhiteSpace(version) || string.IsNullOrWhiteSpace(text))
            return Ok(new { available = false, message = "Signed intake terms are awaiting legal and practice approval." });
        return Ok(new { available = true, version, fullText = text,
            sha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant() });
    }

    [HttpPost("{id:guid}/sign-terms")]
    public async Task<IActionResult> SignTerms(Guid id, [FromBody] TermsSignatureRequest req, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var intake = await _db.OrthodonticIntakes.FirstOrDefaultAsync(x => x.Id == id && x.DentalPracticeId == practiceId && x.ClosedAtUtc == null, ct);
        if (intake is null) return NotFound();
        if (Specialist && intake.AssignedOrthodontistUserId != _current.UserId) return NotFound();
        var docVersion = _settings["Orthodontics:ApprovedIntakeTermsVersion"];
        var docText = _settings["Orthodontics:ApprovedIntakeTermsText"];
        if (string.IsNullOrWhiteSpace(docVersion) || string.IsNullOrWhiteSpace(docText))
            return Conflict(new { message = "The orthodontic intake terms have not been approved; do not collect an electronic signature." });
        if (req.Version != docVersion || !intake.TermsApplicable ||
            string.IsNullOrWhiteSpace(req.SignerName) || req.SignerName.Length > 200 ||
            req.SignerCapacity is not ("Patient" or "ParentOrGuardian" or "Representative") ||
            req.AcceptanceMethod is not ("DrawnSignature" or "AssistedElectronic") ||
            req.SignatureDataUrl?.StartsWith("data:image/png;base64,", StringComparison.Ordinal) != true ||
            req.SignatureDataUrl.Length > 180000)
            return BadRequest(new { message = "The document version, signer details or signature is invalid." });
        var patient = await _db.Patients.AsNoTracking().FirstAsync(x => x.Id == intake.PatientId, ct);
        if (patient.DateOfBirth.HasValue &&
            patient.DateOfBirth.Value > DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-18)))
        {
            var guardian = await _db.PatientRegistrationDetails.AsNoTracking()
                .Where(x => x.DentalPracticeId == practiceId && x.PatientId == intake.PatientId)
                .Select(x => new { x.GuardianConsent, x.ResponsibleName, x.SignerCapacity })
                .FirstOrDefaultAsync(ct);
            // A checkbox on this request is not proof of guardian authority.
            // Require an independently recorded responsible person and the same
            // signatory; any dispute must be reviewed outside this endpoint.
            if (req.SignerCapacity != "ParentOrGuardian" || guardian?.GuardianConsent != true ||
                string.IsNullOrWhiteSpace(guardian.ResponsibleName) ||
                !string.Equals(guardian.ResponsibleName.Trim(), req.SignerName.Trim(),
                    StringComparison.OrdinalIgnoreCase))
                return Conflict(new { message = "Guardian authority or identity has not been verified against patient registration. Review the responsible-person record before signing." });
        }
        if (intake.TermsAcceptedAtUtc.HasValue)
            return Conflict(new { message = "Signed terms are immutable; use the case document history." });
        intake.TermsVersion = docVersion;
        intake.TermsFullText = docText;
        intake.TermsSha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(docText))).ToLowerInvariant();
        intake.TermsSignerName = req.SignerName.Trim();
        intake.TermsSignerCapacity = req.SignerCapacity;
        intake.TermsSignatureDataUrl = req.SignatureDataUrl;
        intake.TermsAcceptanceMethod = req.AcceptanceMethod;
        intake.TermsAcceptedAtUtc = DateTime.UtcNow;
        intake.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHO_INTAKE_TERMS_SIGNED", "OrthodonticIntakeCase", id.ToString(),
            detail: $"version={docVersion};sha256={intake.TermsSha256};signer_capacity={req.SignerCapacity}", ct: ct);
        return Ok(new { intake.Id, intake.TermsVersion, intake.TermsSha256, intake.TermsAcceptedAtUtc });
    }

    [HttpPost("{id:guid}/begin-assessment")]
    [Authorize(Roles = "Dentist,Orthodontist")]
    public async Task<IActionResult> BeginAssessment(Guid id, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId || _current.UserId is not Guid clinician) return Forbid();
        var intake = await _db.OrthodonticIntakes.FirstOrDefaultAsync(x => x.Id == id &&
            x.DentalPracticeId == practiceId && x.AssignedOrthodontistUserId == clinician &&
            x.ClosedAtUtc == null, ct);
        if (intake is null) return NotFound();
        if (intake.Status != "ASSESSMENT_READY")
            return Conflict(new { message = "Complete record, consent and applicable payment readiness before specialist assessment." });
        intake.Status = "ASSESSMENT_IN_PROGRESS";
        intake.AssessmentStartedAtUtc = DateTime.UtcNow;
        intake.AssessmentStartedByUserId = clinician;
        intake.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHO_ASSESSMENT_STARTED", "OrthodonticIntakeCase", id.ToString(), ct: ct);
        return Ok(new { intake.Id, intake.Status });
    }

    // Recover orthodontic classifications registered before the intake table
    // existed. Idempotent, manager-initiated, and never changes patient IDs.
    [HttpPost("sync-classifications")]
    [Authorize(Roles = "PracticeAdmin")]
    public async Task<IActionResult> SyncClassifications(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId || _current.UserId is not Guid actor) return Forbid();
        var registrations = await (
            from details in _db.PatientRegistrationDetails.AsNoTracking()
            join patient in _db.Patients.AsNoTracking() on details.PatientId equals patient.Id
            where details.DentalPracticeId == practiceId && patient.DentalPracticeId == practiceId && !patient.IsArchived
            select new { details.PatientId, details.ProfileJson }
        ).Take(1500).ToListAsync(ct);
        var classifiedIds = registrations.Where(x => IsClassified(x.ProfileJson))
            .Select(x => x.PatientId).Distinct().ToArray();
        var existing = await _db.OrthodonticIntakes.AsNoTracking()
            .Where(x => classifiedIds.Contains(x.PatientId) && x.ClosedAtUtc == null)
            .Select(x => x.PatientId).ToListAsync(ct);
        var missing = classifiedIds.Except(existing).ToArray();
        foreach (var patientId in missing)
        {
            _db.OrthodonticIntakes.Add(new OrthodonticIntakeCase
            {
                DentalPracticeId = practiceId, PatientId = patientId, CreatedByUserId = actor,
                Source = "DIRECT", Status = "RECORDS_PENDING",
                TermsApplicable = true, AdvancePolicy = "STANDARD_R2500",
                MissingDocumentsJson = JsonSerializer.Serialize(new[] {
                    "Orthodontic assessment records", "Clinical history verification",
                    "Guardian/payer review", "Approved intake terms"
                }),
                NextAction = "Previously registered orthodontic patient. Assign specialist and verify intake."
            });
        }
        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23505" })
        {
            return Conflict(new { message = "A concurrent intake was created. Refresh and re-run the sync." });
        }
        await _audit.WriteAsync("ORTHO_CLASSIFICATION_SYNC", "OrthodonticIntakeCase",
            practiceId.ToString(), detail: $"queued={missing.Length};no_patient_or_payment_created", ct: ct);
        return Ok(new { queued = missing.Length, alreadyQueued = existing.Count, totalClassified = classifiedIds.Length });
    }

    private static bool IsClassified(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return false;
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Object &&
                   doc.RootElement.TryGetProperty("orthodonticPatient", out var p) &&
                   p.ValueKind == JsonValueKind.True;
        }
        catch (JsonException) { return false; }
    }
    private static string? Clean(string? text, int max) =>
        string.IsNullOrWhiteSpace(text) ? null : text.Trim()[..Math.Min(max, text.Trim().Length)];
    private static bool ValidListJson(string? json)
    {
        if (json == null) return true;
        if (json.Length > 6000) return false;
        try
        {
            var array = JsonSerializer.Deserialize<string[]>(json);
            return array != null && array.Length <= 30 &&
                   array.All(x => x != null && x.Length is > 0 and <= 250);
        }
        catch (JsonException) { return false; }
    }
}
