#!/usr/bin/env python3
"""CurvTab Dental 2.0 - Phase 4 Dental Charting & Phase 5 Orthodontics installer.

Run at repository root in Codespaces:
    python3 curvtab_phase45_specialties.py

Safety: no migration is run, no database is reset, and existing pages are
backed up. This installer refuses to overwrite already-installed modules.
"""
from pathlib import Path
from datetime import datetime, timezone
import shutil
import sys

ROOT = Path.cwd()
APP = ROOT / 'frontend/src/App.tsx'
DB = ROOT / 'backend/CurvTabDental.Infrastructure/Persistence/DentalDbContext.cs'
PAYMENTS = ROOT / 'backend/CurvTabDental.Domain/Entities/Payment.cs'
CONSULTATIONS = ROOT / 'backend/CurvTabDental.Domain/Entities/Consultation.cs'
for required in (APP, DB, PAYMENTS, CONSULTATIONS):
    if not required.is_file():
        sys.exit(f'ERROR: Missing {required}. Run from repo root after Phase 3 installation.')

FILES = {}

FILES['backend/CurvTabDental.API/Controllers/DentalChartController.cs'] = r'''using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Confidential dental chart; reception cannot access this controller.
[ApiController]
[Route("api/dentist/patients/{patientId:guid}/chart")]
[Authorize(Roles = "Dentist")]
public sealed class DentalChartController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public DentalChartController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public record AddChartEntryRequest(
        string ToothCode, string Surface, string Finding, string? Notes,
        Guid? ConsultationId);

    private static readonly HashSet<string> Surfaces = new(StringComparer.Ordinal)
    {
        "Whole Tooth", "Mesial", "Distal", "Occlusal", "Incisal",
        "Buccal", "Lingual", "Palatal"
    };

    private static readonly HashSet<string> Findings = new(StringComparer.Ordinal)
    {
        "Healthy", "Caries suspected", "Restoration present", "Missing",
        "Crown present", "Fracture", "Root canal treated", "Extraction planned",
        "Sealant present", "Monitor", "Other"
    };

    // GET /api/dentist/patients/{patientId}/chart
    [HttpGet]
    public async Task<IActionResult> GetChart(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();

        if (!await _db.Patients.AsNoTracking().AnyAsync(
                p => p.Id == patientId && p.DentalPracticeId == practiceId, ct))
            return NotFound(new { message = "Patient not found in your practice." });

        var entries = await _db.DentalChartEntries.AsNoTracking()
            .Where(e => e.DentalPracticeId == practiceId && e.PatientId == patientId)
            .OrderByDescending(e => e.RecordedAtUtc)
            .ThenByDescending(e => e.Id)
            .Take(500)
            .Select(e => new
            {
                e.Id, e.PatientId, e.ToothCode, e.Surface, e.Finding,
                e.Notes, e.ConsultationId, e.RecordedByUserId, e.RecordedAtUtc
            })
            .ToListAsync(ct);

        return Ok(entries);
    }

    // POST /api/dentist/patients/{patientId}/chart
    [HttpPost]
    public async Task<IActionResult> AddEntry(
        Guid patientId, [FromBody] AddChartEntryRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid userId) return Unauthorized();
        if (!IsFdiToothCode(request.ToothCode) ||
            !Surfaces.Contains(request.Surface ?? "") ||
            !Findings.Contains(request.Finding ?? "") ||
            request.Notes?.Length > 2000)
        {
            return BadRequest(new { message = "Choose a valid FDI tooth, surface and finding (notes max 2000 characters)." });
        }

        if (!await _db.Patients.AnyAsync(p => p.Id == patientId &&
                p.DentalPracticeId == practiceId && !p.IsArchived, ct))
            return NotFound(new { message = "Active patient not found in this practice." });

        if (request.ConsultationId.HasValue)
        {
            var linked = await _db.Consultations.AsNoTracking().AnyAsync(c =>
                c.Id == request.ConsultationId.Value &&
                c.PatientId == patientId &&
                c.DentalPracticeId == practiceId &&
                c.DentistUserId == userId && !c.IsFinalized, ct);
            if (!linked)
                return BadRequest(new { message = "Only your active consultation for this patient can be linked." });
        }

        var entry = new DentalChartEntry
        {
            DentalPracticeId = practiceId,
            PatientId = patientId,
            RecordedByUserId = userId,
            ToothCode = request.ToothCode,
            Surface = request.Surface,
            Finding = request.Finding,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            ConsultationId = request.ConsultationId,
            RecordedAtUtc = DateTime.UtcNow
        };

        _db.DentalChartEntries.Add(entry);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("DENTAL_CHART_ENTRY_ADDED", "DentalChartEntry", entry.Id.ToString(), ct: ct);

        return Created($"/api/dentist/patients/{patientId}/chart", new
        {
            entry.Id, entry.PatientId, entry.ToothCode, entry.Surface,
            entry.Finding, entry.Notes, entry.ConsultationId,
            entry.RecordedByUserId, entry.RecordedAtUtc
        });
    }

    private static bool IsFdiToothCode(string? value)
    {
        if (value is null || value.Length != 2) return false;
        return (value[0] is >= '1' and <= '4' && value[1] is >= '1' and <= '8') ||
               (value[0] is >= '5' and <= '8' && value[1] is >= '1' and <= '5');
    }
}
'''

FILES['backend/CurvTabDental.API/Controllers/OrthodonticsController.cs'] = r'''using CurvTabDental.Application.Abstractions;
using CurvTabDental.Domain.Entities;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CurvTabDental.API.Controllers;

// Orthodontic plans and progress notes are clinical information.
[ApiController]
[Route("api/dentist/patients/{patientId:guid}/orthodontics")]
[Authorize(Roles = "Dentist")]
public sealed class OrthodonticsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public OrthodonticsController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public record CreateCaseRequest(string Title, string ApplianceType, string Goals, DateOnly? NextReviewDate);
    public record ChangeCaseStatusRequest(string Status);
    public record AddProgressRequest(DateOnly VisitDate, string ProgressNotes,
        string? Adjustments, string? NextSteps, DateOnly? NextReviewDate);

    private static readonly HashSet<string> ApplianceTypes = new(StringComparer.Ordinal)
    {
        "Fixed braces", "Clear aligners", "Removable appliance", "Retainer",
        "Functional appliance", "Other"
    };

    private Task<bool> PatientExists(Guid patientId, Guid practiceId, bool active, CancellationToken ct) =>
        _db.Patients.AsNoTracking().AnyAsync(p => p.Id == patientId &&
            p.DentalPracticeId == practiceId && (!active || !p.IsArchived), ct);

    // GET /api/dentist/patients/{patientId}/orthodontics
    [HttpGet]
    public async Task<IActionResult> List(Guid patientId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await PatientExists(patientId, practiceId, false, ct)) return NotFound();

        var cases = await _db.OrthodonticCases.AsNoTracking()
            .Where(c => c.DentalPracticeId == practiceId && c.PatientId == patientId)
            .OrderByDescending(c => c.CreatedAtUtc)
            .Take(100)
            .Select(c => new
            {
                c.Id, c.PatientId, c.Title, c.ApplianceType, c.Goals,
                c.Status, c.NextReviewDate, c.CreatedByUserId,
                c.CreatedAtUtc, c.CompletedAtUtc
            })
            .ToListAsync(ct);
        return Ok(cases);
    }

    // POST /api/dentist/patients/{patientId}/orthodontics
    [HttpPost]
    public async Task<IActionResult> Create(
        Guid patientId, [FromBody] CreateCaseRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid userId) return Unauthorized();
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Length > 150 ||
            !ApplianceTypes.Contains(request.ApplianceType ?? "") ||
            string.IsNullOrWhiteSpace(request.Goals) || request.Goals.Length > 4000)
        {
            return BadRequest(new { message = "Provide a case title, valid appliance type and treatment goals." });
        }
        if (!await PatientExists(patientId, practiceId, true, ct)) return NotFound();

        var entity = new OrthodonticCase
        {
            DentalPracticeId = practiceId,
            PatientId = patientId,
            CreatedByUserId = userId,
            Title = request.Title.Trim(),
            ApplianceType = request.ApplianceType,
            Goals = request.Goals.Trim(),
            NextReviewDate = request.NextReviewDate,
            Status = "Planning"
        };
        _db.OrthodonticCases.Add(entity);
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHODONTIC_CASE_CREATED", "OrthodonticCase", entity.Id.ToString(), ct: ct);
        return Created($"/api/dentist/patients/{patientId}/orthodontics/{entity.Id}", new { entity.Id, entity.Status });
    }

    // GET /api/dentist/patients/{patientId}/orthodontics/{caseId}
    [HttpGet("{caseId:guid}")]
    public async Task<IActionResult> Details(Guid patientId, Guid caseId, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (!await PatientExists(patientId, practiceId, false, ct)) return NotFound();

        var entity = await _db.OrthodonticCases.AsNoTracking()
            .Where(c => c.Id == caseId && c.PatientId == patientId && c.DentalPracticeId == practiceId)
            .Select(c => new
            {
                c.Id, c.PatientId, c.Title, c.ApplianceType, c.Goals,
                c.Status, c.NextReviewDate, c.CreatedByUserId,
                c.CreatedAtUtc, c.CompletedAtUtc
            })
            .FirstOrDefaultAsync(ct);
        if (entity is null) return NotFound();

        var notes = await _db.OrthodonticProgressNotes.AsNoTracking()
            .Where(n => n.DentalPracticeId == practiceId && n.OrthodonticCaseId == caseId)
            .OrderByDescending(n => n.VisitDate)
            .ThenByDescending(n => n.RecordedAtUtc)
            .Take(300)
            .Select(n => new
            {
                n.Id, n.VisitDate, n.ProgressNotes, n.Adjustments, n.NextSteps,
                n.NextReviewDate, n.RecordedByUserId, n.RecordedAtUtc
            })
            .ToListAsync(ct);
        return Ok(new { orthodonticCase = entity, progressNotes = notes });
    }

    // PATCH /api/dentist/patients/{patientId}/orthodontics/{caseId}/status
    [HttpPatch("{caseId:guid}/status")]
    public async Task<IActionResult> ChangeStatus(
        Guid patientId, Guid caseId, [FromBody] ChangeCaseStatusRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid) return Unauthorized();
        if (!await PatientExists(patientId, practiceId, true, ct)) return NotFound();

        var existing = await _db.OrthodonticCases.AsNoTracking()
            .Where(c => c.Id == caseId && c.PatientId == patientId && c.DentalPracticeId == practiceId)
            .Select(c => new { c.Status }).FirstOrDefaultAsync(ct);
        if (existing is null) return NotFound();

        var validTransition = existing.Status switch
        {
            "Planning" => request.Status == "Active",
            "Active" => request.Status is "Paused" or "Completed",
            "Paused" => request.Status is "Active" or "Completed",
            _ => false
        };
        if (!validTransition)
            return Conflict(new { message = "Invalid orthodontic case status transition." });

        var now = DateTime.UtcNow;
        var finished = request.Status == "Completed" ? (DateTime?)now : null;
        var changed = await _db.OrthodonticCases
            .Where(c => c.Id == caseId && c.PatientId == patientId &&
                        c.DentalPracticeId == practiceId && c.Status == existing.Status)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(c => c.Status, request.Status)
                .SetProperty(c => c.CompletedAtUtc, finished)
                .SetProperty(c => c.UpdatedAtUtc, now), ct);
        if (changed == 0) return Conflict(new { message = "Case changed; refresh and try again." });

        await _audit.WriteAsync("ORTHODONTIC_CASE_STATUS_CHANGED", "OrthodonticCase", caseId.ToString(), ct: ct);
        return Ok(new { id = caseId, status = request.Status });
    }

    // POST /api/dentist/patients/{patientId}/orthodontics/{caseId}/progress
    [HttpPost("{caseId:guid}/progress")]
    public async Task<IActionResult> AddProgress(
        Guid patientId, Guid caseId, [FromBody] AddProgressRequest request,
        CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        if (_current.UserId is not Guid userId) return Unauthorized();
        if (request.VisitDate == default ||
            string.IsNullOrWhiteSpace(request.ProgressNotes) || request.ProgressNotes.Length > 4000 ||
            request.Adjustments?.Length > 2000 || request.NextSteps?.Length > 2000)
            return BadRequest(new { message = "A visit date and progress notes are required." });
        if (!await PatientExists(patientId, practiceId, true, ct)) return NotFound();

        var caseEntity = await _db.OrthodonticCases
            .FirstOrDefaultAsync(c => c.Id == caseId && c.PatientId == patientId &&
                c.DentalPracticeId == practiceId, ct);
        if (caseEntity is null) return NotFound();
        if (caseEntity.Status is "Completed" or "Planning")
            return Conflict(new { message = "Start the case before recording progress; completed cases are read-only." });

        var note = new OrthodonticProgressNote
        {
            DentalPracticeId = practiceId,
            OrthodonticCaseId = caseId,
            RecordedByUserId = userId,
            VisitDate = request.VisitDate,
            ProgressNotes = request.ProgressNotes.Trim(),
            Adjustments = string.IsNullOrWhiteSpace(request.Adjustments) ? null : request.Adjustments.Trim(),
            NextSteps = string.IsNullOrWhiteSpace(request.NextSteps) ? null : request.NextSteps.Trim(),
            NextReviewDate = request.NextReviewDate
        };
        _db.OrthodonticProgressNotes.Add(note);
        if (request.NextReviewDate.HasValue)
        {
            caseEntity.NextReviewDate = request.NextReviewDate;
            caseEntity.UpdatedAtUtc = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
        await _audit.WriteAsync("ORTHODONTIC_PROGRESS_RECORDED", "OrthodonticProgressNote", note.Id.ToString(), ct: ct);
        return Created($"/api/dentist/patients/{patientId}/orthodontics/{caseId}", new { note.Id, note.VisitDate });
    }
}
'''

FILES['backend/CurvTabDental.Domain/Entities/DentalChartEntry.cs'] = r'''using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Append-only clinical observations. A new observation never overwrites history.
public sealed class DentalChartEntry : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? ConsultationId { get; set; }
    public Guid RecordedByUserId { get; set; }
    public string ToothCode { get; set; } = string.Empty; // FDI: e.g. 11, 36, 55
    public string Surface { get; set; } = string.Empty;
    public string Finding { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
'''

FILES['backend/CurvTabDental.Domain/Entities/OrthodonticCase.cs'] = r'''using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// A long-running case linked to the existing patient; never a second patient account.
public sealed class OrthodonticCase : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid PatientId { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ApplianceType { get; set; } = string.Empty;
    public string Goals { get; set; } = string.Empty;
    public string Status { get; set; } = "Planning";
    public DateOnly? NextReviewDate { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAtUtc { get; set; }
}
'''

FILES['backend/CurvTabDental.Domain/Entities/OrthodonticProgressNote.cs'] = r'''using CurvTabDental.Domain.Common;

namespace CurvTabDental.Domain.Entities;

// Append-only progress history; later notes do not erase earlier notes.
public sealed class OrthodonticProgressNote : IPracticeOwned
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DentalPracticeId { get; set; }
    public Guid OrthodonticCaseId { get; set; }
    public Guid RecordedByUserId { get; set; }
    public DateOnly VisitDate { get; set; }
    public string ProgressNotes { get; set; } = string.Empty;
    public string? Adjustments { get; set; }
    public string? NextSteps { get; set; }
    public DateOnly? NextReviewDate { get; set; }
    public DateTime RecordedAtUtc { get; set; } = DateTime.UtcNow;
}
'''

FILES['frontend/src/pages/DentalChartingPage.tsx'] = r'''import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, Plus, RefreshCw, Save } from 'lucide-react'
import { apiRequest } from '../services/api'
import { loadClinicalPatients } from '../utils/clinicalPatients'
import type { ClinicalPatient } from '../utils/clinicalPatients'
import './DentistSpecialties.css'

type ChartEntry = {
  id: string
  patientId: string
  toothCode: string
  surface: string
  finding: string
  notes: string | null
  recordedAtUtc: string
}

const findings = [
  'Healthy', 'Caries suspected', 'Restoration present', 'Missing',
  'Crown present', 'Fracture', 'Root canal treated', 'Extraction planned',
  'Sealant present', 'Monitor', 'Other',
]
const surfaces = [
  'Whole Tooth', 'Mesial', 'Distal', 'Occlusal', 'Incisal',
  'Buccal', 'Lingual', 'Palatal',
]
const permanentUpper = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const permanentLower = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
const primaryUpper = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
const primaryLower = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]

function formatDate(value: string): string {
  return new Date(value).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function DentalChartingPage() {
  const [patients, setPatients] = useState<ClinicalPatient[]>([])
  const [patientId, setPatientId] = useState('')
  const [dentition, setDentition] = useState<'permanent' | 'primary'>('permanent')
  const [toothCode, setToothCode] = useState('11')
  const [surface, setSurface] = useState('Whole Tooth')
  const [finding, setFinding] = useState('Healthy')
  const [notes, setNotes] = useState('')
  const [entries, setEntries] = useState<ChartEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let cancelled = false
    loadClinicalPatients()
      .then((rows) => {
        if (cancelled) return
        setPatients(rows)
        if (rows.length > 0) setPatientId(rows[0].id)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load patients.')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    apiRequest<ChartEntry[]>(`/dentist/patients/${encodeURIComponent(patientId)}/chart`)
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load dental chart.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [patientId, reload])

  const latestByTooth = useMemo(() => {
    const results = new Map<string, ChartEntry>()
    for (const entry of entries) {
      if (!results.has(entry.toothCode)) results.set(entry.toothCode, entry)
    }
    return results
  }, [entries])
  const toothHistory = entries.filter((item) => item.toothCode === toothCode)

  function selectPatient(id: string) {
    setPatientId(id)
    setEntries([])
    setLoading(true)
    setError('')
    setSuccess('')
  }

  function selectDentition(type: 'permanent' | 'primary') {
    setDentition(type)
    setToothCode(type === 'permanent' ? '11' : '51')
    setSurface('Whole Tooth')
  }

  function toothButtons(codes: number[]) {
    return codes.map((code) => {
      const key = String(code)
      const last = latestByTooth.get(key)
      const abnormal = last && last.finding !== 'Healthy'
      return (
        <button key={key} type="button" title={last ? `${last.finding} — ${last.surface}` : 'No observations recorded'}
          className={`specialty-tooth ${toothCode === key ? 'is-selected' : ''} ${abnormal ? 'has-finding' : ''}`}
          aria-pressed={toothCode === key} onClick={() => setToothCode(key)}>
          <span>{key}</span>
          <small>{last ? last.finding : '—'}</small>
        </button>
      )
    })
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patientId) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await apiRequest(`/dentist/patients/${encodeURIComponent(patientId)}/chart`, 'POST', {
        toothCode, surface, finding, notes: notes.trim() || null, consultationId: null,
      })
      setSuccess(`Observation for tooth ${toothCode} saved to the clinical chart.`)
      setNotes('')
      setLoading(true)
      setReload((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save observation.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="specialty-page">
      <div className="page-heading">
        <div><div className="eyebrow">DENTIST · CLINICAL RECORDS</div><h1>Dental Charting</h1>
          <p>Select a tooth, record a finding, and preserve previous observations.</p></div>
        <button type="button" className="secondary-button" disabled={!patientId || loading}
          onClick={() => { setLoading(true); setReload((value) => value + 1) }}>
          <RefreshCw size={17} /> Refresh
        </button>
      </div>

      {error && <div className="specialty-alert specialty-error" role="alert">{error}</div>}
      {success && <div className="specialty-alert specialty-success" role="status">{success}</div>}

      <section className="panel specialty-patient">
        <label htmlFor="chart-patient">Patient</label>
        <select id="chart-patient" value={patientId} onChange={(event) => selectPatient(event.target.value)}>
          <option value="">Select a patient</option>
          {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
        </select>
        <p className="specialty-hint">Only clinical staff can access this chart. Choose a fictional patient for testing.</p>
      </section>

      {patientId && <div className="specialty-columns">
        <section className="panel specialty-chart-panel">
          <div className="panel-header"><div><h2>FDI Tooth Chart</h2><p>Adult and primary dentition</p></div><Activity size={20}/></div>
          <div className="specialty-switch">
            <button type="button" className={dentition === 'permanent' ? 'primary-button' : 'secondary-button'}
              onClick={() => selectDentition('permanent')}>Permanent (32)</button>
            <button type="button" className={dentition === 'primary' ? 'primary-button' : 'secondary-button'}
              onClick={() => selectDentition('primary')}>Primary (20)</button>
          </div>
          <p className="specialty-hint">Select the tooth number. A dot marks a recorded finding. This is a clinical charting aid, not an automated diagnosis.</p>
          <div className="specialty-jaws">
            <div><strong>Upper arch</strong><div className="specialty-tooth-grid">{toothButtons(dentition === 'permanent' ? permanentUpper : primaryUpper)}</div></div>
            <div><strong>Lower arch</strong><div className="specialty-tooth-grid">{toothButtons(dentition === 'permanent' ? permanentLower : primaryLower)}</div></div>
          </div>
          <div className="specialty-history">
            <h3>Tooth {toothCode} · History</h3>
            {loading ? <p>Loading observations...</p> : toothHistory.length === 0 ?
              <p>No findings recorded for this tooth yet.</p> :
              toothHistory.slice(0, 30).map((item) => <article key={item.id} className="specialty-history-entry">
                <div><strong>{item.finding}</strong> <span>· {item.surface}</span></div>
                {item.notes && <p>{item.notes}</p>}
                <small>{formatDate(item.recordedAtUtc)}</small>
              </article>)}
          </div>
        </section>
        <section className="panel specialty-form-panel">
          <div className="panel-header"><div><h2>Add Observation</h2><p>Patient tooth {toothCode}</p></div><Plus size={20}/></div>
          <form onSubmit={(event) => void saveEntry(event)} className="specialty-form">
            <label>Tooth code<input readOnly value={toothCode}/></label>
            <label>Surface<select value={surface} onChange={(event) => setSurface(event.target.value)}>
              {surfaces.map((value) => <option key={value} value={value}>{value}</option>)}
            </select></label>
            <label>Finding<select value={finding} onChange={(event) => setFinding(event.target.value)}>
              {findings.map((value) => <option key={value} value={value}>{value}</option>)}
            </select></label>
            <label>Clinical notes (optional)<textarea rows={5} maxLength={2000} value={notes}
              onChange={(event) => setNotes(event.target.value)} placeholder="Specify location, assessment, and clinical observations..."/></label>
            <p className="specialty-hint">Each save adds a dated entry. Past observations are not silently edited or deleted.</p>
            <button type="submit" className="primary-button" disabled={busy || loading}>
              <Save size={17}/>{busy ? 'Saving...' : 'Save Tooth Observation'}
            </button>
          </form>
        </section>
      </div>}
    </div>
  )
}
'''

FILES['frontend/src/pages/DentistSpecialties.css'] = r'''.specialty-page{display:grid;gap:20px;min-width:0}
.specialty-page .panel{min-width:0}
.specialty-columns{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,1fr);gap:20px;align-items:start}
.specialty-patient{display:grid;gap:8px}
.specialty-patient label{font-weight:700;font-size:13px}
.specialty-page input,.specialty-page textarea,.specialty-page select{border:1px solid #c6d6df;background:transparent;color:inherit;border-radius:9px;padding:10px 12px;box-sizing:border-box;font:inherit;width:100%;min-width:0}
.specialty-page textarea{resize:vertical;line-height:1.45}
.specialty-page .primary-button,.specialty-page .secondary-button{display:inline-flex;align-items:center;gap:8px}
.specialty-form{display:grid;gap:13px}
.specialty-form label{display:grid;gap:6px;font-weight:600;font-size:13px}
.specialty-form h3{display:flex;align-items:center;gap:7px;margin:4px 0;font-size:16px}
.specialty-form-panel,.specialty-chart-panel{display:grid;gap:20px}
.specialty-hint{font-size:12px;color:#728595;line-height:1.5;margin:0}
.specialty-switch{display:flex;flex-wrap:wrap;gap:8px}
.specialty-jaws{display:grid;gap:20px}
.specialty-jaws>div{display:grid;gap:9px}
.specialty-jaws strong{font-size:13px}
.specialty-tooth-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:5px}
.specialty-tooth{position:relative;padding:9px 3px;min-width:0;min-height:65px;border-radius:9px;border:1px solid #c7d6df;background:transparent;color:inherit;display:grid;align-content:center;justify-items:center;gap:3px;cursor:pointer}
.specialty-tooth span{font-weight:700;font-size:14px}
.specialty-tooth small{font-size:9px;color:#8393a0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.specialty-tooth.has-finding:after{content:'';position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;background:#d18a23}
.specialty-tooth.is-selected{background:rgba(20,153,160,.13);border-color:#138e97;box-shadow:inset 0 0 0 1px #138e97}
.specialty-history{display:grid;gap:10px}
.specialty-history h3{font-size:16px;margin:3px 0}
.specialty-history-entry{display:grid;gap:5px;padding:12px;border:1px solid #d6e2e9;border-radius:10px;overflow-wrap:anywhere}
.specialty-history-entry p{margin:0;white-space:pre-wrap;font-size:13px}
.specialty-history-entry span,.specialty-history-entry small{color:#728595;font-size:12px}
.specialty-alert{padding:11px 14px;border-radius:9px;font-size:13px}
.specialty-error{background:rgba(195,32,58,.1);color:#ad3145}
.specialty-success{background:rgba(28,148,103,.1);color:#167b52}
.specialty-case-list{display:grid;gap:9px}
.specialty-case{width:100%;display:grid;gap:4px;text-align:left;padding:12px;border-radius:10px;border:1px solid #cddce5;color:inherit;background:transparent;cursor:pointer}
.specialty-case.selected{border-color:#138e97;background:rgba(20,153,160,.1)}
.specialty-case span,.specialty-case small{color:#728595;font-size:12px}
.specialty-divider{padding-top:18px;border-top:1px solid #dae4e9}
.specialty-overview{display:grid;gap:8px;padding:14px;border:1px solid #d6e2e9;border-radius:10px}
.specialty-overview p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}
.specialty-overview small{color:#728595}
.specialty-status{font-size:12px;font-weight:700;background:rgba(20,153,160,.1);padding:5px 10px;border-radius:20px;justify-self:start}
@media(max-width:1020px){.specialty-columns{grid-template-columns:1fr}}
@media(max-width:640px){.specialty-tooth-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
'''

FILES['frontend/src/pages/OrthodonticsPage.tsx'] = r'''import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardList, Plus, RefreshCw, Save } from 'lucide-react'
import { apiRequest } from '../services/api'
import { loadClinicalPatients } from '../utils/clinicalPatients'
import type { ClinicalPatient } from '../utils/clinicalPatients'
import './DentistSpecialties.css'

type OrthoStatus = 'Planning' | 'Active' | 'Paused' | 'Completed'
type OrthoCase = {
  id: string
  patientId: string
  title: string
  applianceType: string
  goals: string
  status: OrthoStatus
  nextReviewDate: string | null
  createdAtUtc: string
}
type ProgressNote = {
  id: string
  visitDate: string
  progressNotes: string
  adjustments: string | null
  nextSteps: string | null
  nextReviewDate: string | null
  recordedAtUtc: string
}
type CaseDetails = { orthodonticCase: OrthoCase; progressNotes: ProgressNote[] }

const appliances = ['Fixed braces', 'Clear aligners', 'Removable appliance', 'Retainer', 'Functional appliance', 'Other']
function localDate(): string {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function nextStatuses(status: OrthoStatus): OrthoStatus[] {
  if (status === 'Planning') return ['Active']
  if (status === 'Active') return ['Paused', 'Completed']
  if (status === 'Paused') return ['Active', 'Completed']
  return []
}

export default function OrthodonticsPage() {
  const [patients, setPatients] = useState<ClinicalPatient[]>([])
  const [patientId, setPatientId] = useState('')
  const [cases, setCases] = useState<OrthoCase[]>([])
  const [caseId, setCaseId] = useState('')
  const [details, setDetails] = useState<CaseDetails | null>(null)
  const [title, setTitle] = useState('')
  const [applianceType, setApplianceType] = useState(appliances[0])
  const [goals, setGoals] = useState('')
  const [reviewDate, setReviewDate] = useState('')
  const [visitDate, setVisitDate] = useState(localDate())
  const [progress, setProgress] = useState('')
  const [adjustments, setAdjustments] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [nextReview, setNextReview] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let cancelled = false
    loadClinicalPatients()
      .then((rows) => {
        if (cancelled) return
        setPatients(rows)
        if (rows.length) setPatientId(rows[0].id)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load patients.')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!patientId) return
    let cancelled = false
    apiRequest<OrthoCase[]>(`/dentist/patients/${encodeURIComponent(patientId)}/orthodontics`)
      .then((rows) => {
        if (cancelled) return
        setCases(rows)
        setCaseId((previous) => previous && rows.some((item) => item.id === previous)
          ? previous : rows[0]?.id ?? '')
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load orthodontic cases.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [patientId, reload])

  useEffect(() => {
    if (!patientId || !caseId) return
    let cancelled = false
    apiRequest<CaseDetails>(`/dentist/patients/${encodeURIComponent(patientId)}/orthodontics/${encodeURIComponent(caseId)}`)
      .then((result) => { if (!cancelled) setDetails(result) })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load progress notes.')
      })
    return () => { cancelled = true }
  }, [patientId, caseId, reload])

  function selectPatient(id: string) {
    setPatientId(id)
    setCases([])
    setCaseId('')
    setDetails(null)
    setError('')
    setSuccess('')
    setLoading(true)
  }

  async function createCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patientId) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const result = await apiRequest<{ id: string }>(
        `/dentist/patients/${encodeURIComponent(patientId)}/orthodontics`, 'POST', {
          title: title.trim(), applianceType, goals: goals.trim(), nextReviewDate: reviewDate || null,
        })
      setCaseId(result.id)
      setTitle('')
      setGoals('')
      setReviewDate('')
      setSuccess('Orthodontic case created in Planning status.')
      setLoading(true)
      setReload((v) => v + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create case.')
    } finally { setBusy(false) }
  }

  async function updateStatus(newStatus: OrthoStatus) {
    if (!patientId || !caseId) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await apiRequest(
        `/dentist/patients/${encodeURIComponent(patientId)}/orthodontics/${encodeURIComponent(caseId)}/status`,
        'PATCH', { status: newStatus })
      setSuccess(`Case moved to ${newStatus}.`)
      setReload((v) => v + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change case status.')
    } finally { setBusy(false) }
  }

  async function addProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!patientId || !caseId) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await apiRequest(
        `/dentist/patients/${encodeURIComponent(patientId)}/orthodontics/${encodeURIComponent(caseId)}/progress`,
        'POST', {
          visitDate, progressNotes: progress.trim(), adjustments: adjustments.trim() || null,
          nextSteps: nextSteps.trim() || null, nextReviewDate: nextReview || null,
        })
      setProgress('')
      setAdjustments('')
      setNextSteps('')
      setNextReview('')
      setSuccess('Progress note added to this orthodontic case.')
      setReload((v) => v + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save progress note.')
    } finally { setBusy(false) }
  }

  const current = details?.orthodonticCase.id === caseId ? details : null
  const selectedCase = cases.find((item) => item.id === caseId)
  const currentStatus = selectedCase?.status

  return (
    <div className="specialty-page">
      <div className="page-heading"><div>
        <div className="eyebrow">DENTIST · LONG-TERM TREATMENT</div>
        <h1>Orthodontics</h1>
        <p>Create patient cases, monitor progress and schedule clinical reviews.</p>
      </div><button type="button" className="secondary-button" disabled={!patientId || loading}
        onClick={() => { setLoading(true); setReload((v) => v + 1) }}>
        <RefreshCw size={17}/> Refresh
      </button></div>

      {error && <div className="specialty-alert specialty-error" role="alert">{error}</div>}
      {success && <div className="specialty-alert specialty-success" role="status">{success}</div>}
      <section className="panel specialty-patient">
        <label htmlFor="ortho-patient">Patient</label>
        <select id="ortho-patient" value={patientId} onChange={(event) => selectPatient(event.target.value)}>
          <option value="">Select a patient</option>
          {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
        </select>
        <p className="specialty-hint">Private clinical case details are only accessible to authorised Dentist accounts.</p>
      </section>

      {patientId && <div className="specialty-columns">
        <section className="panel specialty-form-panel">
          <div className="panel-header"><div><h2>Orthodontic Cases</h2><p>{cases.length} saved</p></div><ClipboardList size={21}/></div>
          {cases.length === 0 ? <p className="specialty-hint">No cases registered for this patient.</p> :
            <div className="specialty-case-list">{cases.map((item) => (
              <button type="button" key={item.id}
                className={`specialty-case ${item.id === caseId ? 'selected' : ''}`}
                onClick={() => { setCaseId(item.id); setDetails(null); setError('') }}>
                <strong>{item.title}</strong><span>{item.applianceType}</span>
                <small>{item.status} · Next review: {item.nextReviewDate || 'Not scheduled'}</small>
              </button>
            ))}</div>}
          <form className="specialty-form specialty-divider" onSubmit={(event) => void createCase(event)}>
            <h3><Plus size={17}/> New Orthodontic Case</h3>
            <label>Case title<input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Upper and lower alignment"/></label>
            <label>Appliance type<select value={applianceType} onChange={(e) => setApplianceType(e.target.value)}>
              {appliances.map((item) => <option key={item} value={item}>{item}</option>)}
            </select></label>
            <label>Treatment goals<textarea required rows={4} maxLength={4000} value={goals}
              onChange={(e) => setGoals(e.target.value)} placeholder="Record patient-specific clinical objectives..."/></label>
            <label>Planned review date (optional)<input type="date" value={reviewDate}
              onChange={(e) => setReviewDate(e.target.value)}/></label>
            <button type="submit" className="primary-button" disabled={busy}><Save size={17}/>
              {busy ? 'Saving...' : 'Create Case'}</button>
          </form>
        </section>

        <section className="panel specialty-chart-panel">
          <div className="panel-header"><div><h2>Case Progress</h2><p>Permanent clinical progress history</p></div><ClipboardList size={21}/></div>
          {!caseId || !selectedCase ? <p className="specialty-hint">Select or create a case to manage its progress.</p> : <>
            <div className="specialty-overview">
              <strong>{selectedCase.title}</strong>
              <span className="specialty-status">{currentStatus}</span>
              <p>{selectedCase.goals}</p>
              <small>Next review: {selectedCase.nextReviewDate || 'Not scheduled'}</small>
            </div>
            <div className="specialty-switch">
              {currentStatus && nextStatuses(currentStatus).map((status) => (
                <button key={status} type="button" className="secondary-button" disabled={busy}
                  onClick={() => void updateStatus(status)}>
                  {status === 'Active' ? 'Start / Resume Case' : status === 'Paused' ? 'Pause Case' : 'Complete Case'}
                </button>
              ))}
            </div>
            {(currentStatus === 'Active' || currentStatus === 'Paused') &&
              <form className="specialty-form specialty-divider" onSubmit={(event) => void addProgress(event)}>
                <h3>Add Progress Note</h3>
                <label>Visit date<input type="date" required value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}/></label>
                <label>Clinical progress<textarea required rows={4} maxLength={4000} value={progress}
                  onChange={(e) => setProgress(e.target.value)} placeholder="Progress since last visit..."/></label>
                <label>Appliance adjustments<textarea rows={3} maxLength={2000} value={adjustments}
                  onChange={(e) => setAdjustments(e.target.value)}/></label>
                <label>Next steps<textarea rows={3} maxLength={2000} value={nextSteps}
                  onChange={(e) => setNextSteps(e.target.value)}/></label>
                <label>Next review date (optional)<input type="date" value={nextReview}
                  onChange={(e) => setNextReview(e.target.value)}/></label>
                <button type="submit" className="primary-button" disabled={busy}>
                  <Save size={17}/>{busy ? 'Saving...' : 'Save Progress Note'}
                </button>
              </form>}
            <div className="specialty-history specialty-divider">
              <h3>Progress History</h3>
              {current === null ? <p className="specialty-hint">Loading history...</p> :
                current.progressNotes.length === 0 ? <p>No visits recorded yet.</p> :
                current.progressNotes.map((note) => <article key={note.id} className="specialty-history-entry">
                  <strong>{note.visitDate}</strong><p>{note.progressNotes}</p>
                  {note.adjustments && <p><b>Adjustments:</b> {note.adjustments}</p>}
                  {note.nextSteps && <p><b>Next steps:</b> {note.nextSteps}</p>}
                  <small>Next review: {note.nextReviewDate || 'Not set'}</small>
                </article>)}
            </div>
          </>}
        </section>
      </div>}
    </div>
  )
}
'''

FILES['frontend/src/utils/clinicalPatients.ts'] = r'''import { apiRequest } from '../services/api'

export type ClinicalPatient = { id: string; name: string }

// Matches the existing /api/patients response shapes used by AppointmentsPage.
export async function loadClinicalPatients(): Promise<ClinicalPatient[]> {
  const response = await apiRequest<unknown>('/patients')
  const record = (response && typeof response === 'object' && !Array.isArray(response))
    ? response as Record<string, unknown>
    : null
  const items = Array.isArray(response)
    ? response
    : record?.items ?? record?.patients ?? record?.data ?? record?.results

  if (!Array.isArray(items)) throw new Error('Unable to load the patient directory.')

  return items.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid patient directory response.')
    const item = value as Record<string, unknown>
    if (typeof item.id !== 'string') throw new Error('Patient ID is missing.')
    const name = (typeof item.fullName === 'string' && item.fullName) ||
      (typeof item.name === 'string' && item.name) ||
      [item.firstName, item.lastName].filter((part) => typeof part === 'string').join(' ')
    return { id: item.id, name: name || 'Unnamed patient' }
  })
}
'''



def replace_once(source: str, old: str, new: str, label: str) -> str:
    matches = source.count(old)
    if matches != 1:
        sys.exit(f'ERROR: {label}: expected one anchor, found {matches}. No files changed.')
    return source.replace(old, new, 1)

if any((ROOT / name).exists() for name in FILES):
    sys.exit('ERROR: Phase 4/5 files already exist. No existing files were overwritten:\n' +
             '\n'.join(name for name in FILES if (ROOT / name).exists()))

app = APP.read_text(encoding='utf-8')
db = DB.read_text(encoding='utf-8')

if 'DbSet<Payment> Payments' not in db or 'DbSet<Consultation> Consultations' not in db:
    sys.exit('ERROR: Expected Phase 2/3 entities not found in DentalDbContext. No changes made.')

# Extend EF Core without modifying any existing table configuration.
db = replace_once(db,
    '    public DbSet<Payment> Payments => Set<Payment>();',
    '''    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<DentalChartEntry> DentalChartEntries => Set<DentalChartEntry>();
    public DbSet<OrthodonticCase> OrthodonticCases => Set<OrthodonticCase>();
    public DbSet<OrthodonticProgressNote> OrthodonticProgressNotes => Set<OrthodonticProgressNote>();''',
    'EF DbSet declarations')

db = replace_once(db,
    '        modelBuilder.Entity<Payment>(entity =>',
    '''        // Phase 4: append-only tooth findings and chart history.
        modelBuilder.Entity<DentalChartEntry>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasQueryFilter(e => e.DentalPracticeId == CurrentPracticeId);
            entity.Property(e => e.ToothCode).IsRequired().HasMaxLength(2);
            entity.Property(e => e.Surface).IsRequired().HasMaxLength(40);
            entity.Property(e => e.Finding).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Notes).HasMaxLength(2000);
            entity.HasIndex(e => new { e.DentalPracticeId, e.PatientId, e.RecordedAtUtc });
            entity.HasOne<Patient>().WithMany().HasForeignKey(e => e.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<Consultation>().WithMany().HasForeignKey(e => e.ConsultationId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Phase 5: an orthodontic treatment case belongs to an existing patient.
        modelBuilder.Entity<OrthodonticCase>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.HasQueryFilter(c => c.DentalPracticeId == CurrentPracticeId);
            entity.Property(c => c.Title).IsRequired().HasMaxLength(150);
            entity.Property(c => c.ApplianceType).IsRequired().HasMaxLength(100);
            entity.Property(c => c.Goals).IsRequired().HasMaxLength(4000);
            entity.Property(c => c.Status).IsRequired().HasMaxLength(30);
            entity.HasIndex(c => new { c.DentalPracticeId, c.PatientId });
            entity.HasOne<Patient>().WithMany().HasForeignKey(c => c.PatientId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OrthodonticProgressNote>(entity =>
        {
            entity.HasKey(n => n.Id);
            entity.HasQueryFilter(n => n.DentalPracticeId == CurrentPracticeId);
            entity.Property(n => n.ProgressNotes).IsRequired().HasMaxLength(4000);
            entity.Property(n => n.Adjustments).HasMaxLength(2000);
            entity.Property(n => n.NextSteps).HasMaxLength(2000);
            entity.HasIndex(n => new { n.DentalPracticeId, n.OrthodonticCaseId, n.VisitDate });
            entity.HasOne<OrthodonticCase>().WithMany()
                .HasForeignKey(n => n.OrthodonticCaseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Payment>(entity =>''',
    'EF model configurations')

app = replace_once(app,
    "'Dashboard' | 'Daily Patients' | 'Consultations' | 'Patient Medical Records' | 'Checkout & Payments'",
    "'Dashboard' | 'Daily Patients' | 'Consultations' | 'Patient Medical Records' | 'Checkout & Payments' | 'Dental Charting' | 'Orthodontics'",
    'App.tsx Section type')

app = "import DentalChartingPage from './pages/DentalChartingPage'\n" + \
      "import OrthodonticsPage from './pages/OrthodonticsPage'\n" + app

app = replace_once(app,
    '        </nav>\n\n        <div className="sidebar-bottom">',
    '''          {role === 'Dentist' && (
            <>
              <button type="button"
                className={section === 'Dental Charting' ? 'nav-item nav-active' : 'nav-item'}
                onClick={() => navigate('Dental Charting')}>
                <Activity size={19} /><span>Dental Charting</span>
              </button>
              <button type="button"
                className={section === 'Orthodontics' ? 'nav-item nav-active' : 'nav-item'}
                onClick={() => navigate('Orthodontics')}>
                <Stethoscope size={19} /><span>Orthodontics</span>
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-bottom">''',
    'Dentist sidebar')

app = replace_once(app,
    '          {/* PROFILE FOR ALL ROLES */}',
    '''          {/* PHASE 4/5: DENTIST SPECIALTIES */}
          {section === 'Dental Charting' && role === 'Dentist' && <DentalChartingPage />}
          {section === 'Orthodontics' && role === 'Dentist' && <OrthodonticsPage />}

          {/* PROFILE FOR ALL ROLES */}''',
    'Dentist specialty page rendering')

app = replace_once(app,
    "            (section === 'Checkout & Payments' && role !== 'Receptionist' && role !== 'PracticeAdmin') ||",
    "            (section === 'Dental Charting' && role !== 'Dentist') ||\n" +
    "            (section === 'Orthodontics' && role !== 'Dentist') ||\n" +
    "            (section === 'Checkout & Payments' && role !== 'Receptionist' && role !== 'PracticeAdmin') ||",
    'Specialty access guard')

# All validation has passed: back up the two existing files, then write changes.
backup_dir = ROOT / '.phase45_backups' / datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
backup_dir.mkdir(parents=True, exist_ok=False)
shutil.copy2(APP, backup_dir / 'App.tsx')
shutil.copy2(DB, backup_dir / 'DentalDbContext.cs')

for name, content in FILES.items():
    destination = ROOT / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(content, encoding='utf-8')
APP.write_text(app, encoding='utf-8')
DB.write_text(db, encoding='utf-8')

print('SUCCESS: Phase 4 Dental Charting and Phase 5 Orthodontics code installed.')
print('Backups:', backup_dir)
print('No database changes were executed. Review and apply one additive migration next.')
