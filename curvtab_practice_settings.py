#!/usr/bin/env python3
"""CurvTab Dental: targeted PracticeAdmin Settings implementation.
No database changes. Run from the Codespaces repository root.
Checks App.tsx before writing. Backs up modified files.
"""
from pathlib import Path
from datetime import datetime
import shutil, sys

root = Path.cwd()
app = root/'frontend/src/App.tsx'
api = root/'backend/CurvTabDental.API/Controllers/PracticeSettingsController.cs'
page = root/'frontend/src/pages/PracticeSettingsPage.tsx'
css = root/'frontend/src/pages/PracticeSettingsPage.css'
context = root/'backend/CurvTabDental.Infrastructure/Persistence/DentalDbContext.cs'
for p in (app, context):
    if not p.is_file(): sys.exit(f'ERROR: Missing {p}. Run from CurvTab-Dental-2.0 project root.')
source = app.read_text()
if 'PracticeSettingsPage' in source or "'Practice Settings'" in source or api.exists():
    sys.exit('STOP: A Practice Settings implementation already exists. Review files before re-running.')
if not all(s in source for s in ["import StaffPage from './pages/StaffPage'", "  | 'Management'", "{ name: 'Management' as Section, icon: Settings },", "{section === 'Management' && canManageStaff && (", "{/* PROFILE FOR ALL ROLES */}"]):
    sys.exit('STOP: App.tsx differs from the verified source; no files changed. Send current App.tsx for a safe patch.')
if not all(s in context.read_text() for s in ['DbSet<DentalPractice>', 'DentalPractices']):
    sys.exit('STOP: DentalDbContext does not expose DentalPractices. No files changed.')

api_text = r'''using CurvTabDental.Application.Abstractions;
using CurvTabDental.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Net.Mail;

namespace CurvTabDental.API.Controllers;

// PracticeAdmin can edit ONLY their own dental practice.
[ApiController]
[Route("api/practice/settings")]
[Authorize(Roles = "PracticeAdmin")]
public sealed class PracticeSettingsController : ControllerBase
{
    private readonly DentalDbContext _db;
    private readonly ICurrentUser _current;
    private readonly IAuditService _audit;

    public PracticeSettingsController(DentalDbContext db, ICurrentUser current, IAuditService audit)
    {
        _db = db;
        _current = current;
        _audit = audit;
    }

    public sealed record UpdatePracticeSettingsRequest(
        string Name,
        string? Email,
        string? PhoneNumber,
        string? Address);

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var practice = await _db.DentalPractices.AsNoTracking()
            .Where(p => p.Id == practiceId && p.IsActive)
            .Select(p => new { p.Id, p.Name, p.Email, p.PhoneNumber, p.Address })
            .SingleOrDefaultAsync(ct);
        return practice is null ? NotFound() : Ok(practice);
    }

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdatePracticeSettingsRequest request, CancellationToken ct)
    {
        if (_current.PracticeId is not Guid practiceId) return Forbid();
        var name = request.Name?.Trim() ?? "";
        var email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim();
        var phone = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim();
        var address = string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim();

        if (name.Length is < 2 or > 200)
            return BadRequest(new { message = "Practice name must be 2–200 characters." });
        if (email is { Length: > 256 } || (email is not null && !MailAddress.TryCreate(email, out _)))
            return BadRequest(new { message = "Enter a valid practice email (maximum 256 characters)." });
        if (phone is { Length: > 30 })
            return BadRequest(new { message = "Phone number must be 30 characters or fewer." });
        if (address is { Length: > 500 })
            return BadRequest(new { message = "Address must be 500 characters or fewer." });

        var practice = await _db.DentalPractices
            .SingleOrDefaultAsync(p => p.Id == practiceId && p.IsActive, ct);
        if (practice is null) return NotFound();

        practice.Name = name;
        practice.Email = email;
        practice.PhoneNumber = phone;
        practice.Address = address;
        await _db.SaveChangesAsync(ct);

        await _audit.WriteAsync("PRACTICE_SETTINGS_UPDATED", "DentalPractice", practice.Id.ToString(), ct: ct);

        return Ok(new { practice.Id, practice.Name, practice.Email, practice.PhoneNumber, practice.Address });
    }
}
'''
page_text = r'''import { useEffect, useState } from 'react'
import { Building2, CheckCircle2, LoaderCircle, Mail, MapPin, Phone, Save, ShieldCheck, Users } from 'lucide-react'
import { apiRequest } from '../services/api'
import './PracticeSettingsPage.css'

type Practice = {
  id: string
  name: string
  email: string | null
  phoneNumber: string | null
  address: string | null
}

type FormData = {
  name: string
  email: string
  phoneNumber: string
  address: string
}

const fromPractice = (p: Practice): FormData => ({
  name: p.name, email: p.email ?? '', phoneNumber: p.phoneNumber ?? '', address: p.address ?? '',
})

export default function PracticeSettingsPage({ onOpenStaff }: { onOpenStaff: () => void }) {
  const [form, setForm] = useState<FormData>({ name: '', email: '', phoneNumber: '', address: '' })
  const [initial, setInitial] = useState<FormData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let cancelled = false
    apiRequest<Practice>('/practice/settings')
      .then((p) => { if (!cancelled) { const data = fromPractice(p); setForm(data); setInitial(data) } })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load practice settings.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const dirty = initial !== null && Object.keys(form).some((key) => form[key as keyof FormData] !== initial[key as keyof FormData])
  const update = (key: keyof FormData, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    setSuccess('')
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !dirty) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const saved = await apiRequest<Practice>('/practice/settings', 'PUT', {
        name: form.name.trim(), email: form.email.trim() || null,
        phoneNumber: form.phoneNumber.trim() || null, address: form.address.trim() || null,
      })
      const data = fromPractice(saved)
      setForm(data)
      setInitial(data)
      setSuccess('Practice details saved. Refresh the page if the sidebar still shows the previous practice name.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save practice settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="ct-settings-page">
      <div className="ct-settings-title">
        <div><span className="ct-settings-eyebrow">PRACTICE ADMINISTRATION</span><h1>Practice Settings</h1>
          <p>Manage the public contact details of your dental practice, without any technical commands.</p></div>
        <span className="ct-settings-lock"><ShieldCheck size={17} /> PracticeAdmin only</span>
      </div>
      {error && <div className="ct-settings-alert ct-settings-error" role="alert">{error}</div>}
      {success && <div className="ct-settings-alert ct-settings-success" role="status"><CheckCircle2 size={18} /> {success}</div>}
      <div className="ct-settings-grid">
        <form className="ct-settings-card" onSubmit={(event) => void save(event)}>
          <div className="ct-settings-card-head"><Building2 size={22} /><div><h2>Practice profile</h2><p>Changes save to your existing PostgreSQL practice record.</p></div></div>
          {loading ? <p className="ct-settings-loading"><LoaderCircle className="ct-settings-spin" size={18} /> Loading your practice...</p> : <>
            <label htmlFor="ct-practice-name">Practice name <span aria-hidden="true">*</span></label>
            <input id="ct-practice-name" required minLength={2} maxLength={200} value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Your dental practice name" />
            <label htmlFor="ct-practice-email"><Mail size={15} /> Contact email</label>
            <input id="ct-practice-email" type="email" maxLength={256} value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="reception@example.com" />
            <label htmlFor="ct-practice-phone"><Phone size={15} /> Phone number</label>
            <input id="ct-practice-phone" type="tel" maxLength={30} value={form.phoneNumber} onChange={(e) => update('phoneNumber', e.target.value)} placeholder="+27 ..." />
            <label htmlFor="ct-practice-address"><MapPin size={15} /> Practice address</label>
            <textarea id="ct-practice-address" rows={3} maxLength={500} value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="Street address, city, postal code" />
            <div className="ct-settings-actions"><span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span><button className="ct-settings-save" type="submit" disabled={!dirty || saving}>{saving ? <LoaderCircle className="ct-settings-spin" size={17}/> : <Save size={17}/>} {saving ? 'Saving...' : 'Save changes'}</button></div>
          </>}
        </form>
        <aside className="ct-settings-aside">
          <div className="ct-settings-card"><Users size={24}/><h2>Team & access</h2><p>Invite staff and manage active employees using your existing Staff Management screen.</p><button type="button" onClick={onOpenStaff}>Open Staff Management →</button></div>
          <div className="ct-settings-card"><ShieldCheck size={24}/><h2>Security</h2><p>Practice details are restricted to your signed-in practice. Login passwords are managed separately in My Profile.</p></div>
        </aside>
      </div>
    </section>
  )
}
'''
css_text = r'''.ct-settings-page{width:100%;max-width:1150px;margin:auto;color:#203454}.ct-settings-title{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:25px}.ct-settings-eyebrow{font-size:11px;letter-spacing:.16em;color:#0875d3;font-weight:800}.ct-settings-title h1{font-size:clamp(24px,3vw,34px);margin:8px 0}.ct-settings-title p,.ct-settings-card p{color:#62758e;line-height:1.55}.ct-settings-lock{border:1px solid #d8e7f7;border-radius:999px;display:flex;align-items:center;gap:8px;background:#f2f8ff;padding:10px 13px;color:#2b5e91;font-size:12px;white-space:nowrap}.ct-settings-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(230px,1fr);gap:20px}.ct-settings-card{background:#fff;border:1px solid #e3ebf5;border-radius:18px;padding:26px;box-shadow:0 6px 22px rgba(36,68,111,.045);display:flex;flex-direction:column;gap:10px}.ct-settings-card h2{font-size:18px;margin:0}.ct-settings-card p{margin:4px 0 12px;font-size:13px}.ct-settings-card-head{display:flex;gap:13px;align-items:start;border-bottom:1px solid #edf1f6;margin-bottom:8px;padding-bottom:15px;color:#1476d3}.ct-settings-card-head h2{color:#203454}.ct-settings-card label{display:flex;gap:7px;align-items:center;font-size:13px;font-weight:700;color:#344862;margin-top:11px}.ct-settings-card input,.ct-settings-card textarea{background:#fff!important;color:#1d3051!important;border:1.5px solid #d5e1ef!important;border-radius:10px!important;padding:12px 14px!important;width:100%;box-sizing:border-box;font:inherit;transition:border-color .2s,box-shadow .2s}.ct-settings-card input:focus,.ct-settings-card textarea:focus{outline:none;border-color:#1680e8!important;box-shadow:0 0 0 4px rgba(22,128,232,.12)}.ct-settings-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:20px;padding-top:18px;border-top:1px solid #edf1f6;font-size:12px;color:#72819b}.ct-settings-save,.ct-settings-aside button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:10px;background:#096fdf;color:#fff;padding:12px 18px;font-weight:700;cursor:pointer;transition:transform .18s,box-shadow .18s}.ct-settings-save:hover:not(:disabled),.ct-settings-aside button:hover{transform:translateY(-2px);box-shadow:0 9px 18px rgba(9,111,223,.18)}.ct-settings-save:disabled{opacity:.55;cursor:not-allowed}.ct-settings-aside{display:flex;flex-direction:column;gap:18px}.ct-settings-aside .ct-settings-card>svg{color:#096fdf}.ct-settings-aside button{align-self:start;background:#eef5ff;color:#1264b3}.ct-settings-alert{padding:13px 16px;border-radius:11px;margin:0 0 15px;display:flex;gap:9px}.ct-settings-error{color:#a22d38;background:#fff1f2}.ct-settings-success{color:#126d53;background:#ebf9f2}.ct-settings-loading{display:flex;align-items:center;gap:9px}.ct-settings-spin{animation:ct-settings-spin 1s linear infinite}@keyframes ct-settings-spin{to{transform:rotate(360deg)}}@media(max-width:800px){.ct-settings-grid{grid-template-columns:1fr}.ct-settings-title{flex-wrap:wrap}.ct-settings-card{padding:19px}}@media(prefers-reduced-motion:reduce){.ct-settings-card button{transition:none}.ct-settings-spin{animation:none}}
'''

updated = source
updated = updated.replace("import StaffPage from './pages/StaffPage'", "import StaffPage from './pages/StaffPage'\nimport PracticeSettingsPage from './pages/PracticeSettingsPage'", 1)
updated = updated.replace("  | 'Management'", "  | 'Practice Settings'\n  | 'Management'",1)
updated = updated.replace("{ name: 'Management' as Section, icon: Settings },", "{ name: 'Management' as Section, icon: Settings },\n              { name: 'Practice Settings' as Section, icon: Settings },",1)
updated = updated.replace("          {/* PROFILE FOR ALL ROLES */}", "          {/* PRACTICE SETTINGS — ONLY PracticeAdmin */}\n          {section === 'Practice Settings' && canManageStaff && (\n            <PracticeSettingsPage onOpenStaff={() => navigate('Management')} />\n          )}\n\n          {/* PROFILE FOR ALL ROLES */}",1)
updated = updated.replace("(section === 'Management' && !canManageStaff) ||", "(section === 'Management' && !canManageStaff) ||\n            (section === 'Practice Settings' && !canManageStaff) ||",1)

if updated == source or updated.count("'Practice Settings'") < 4: sys.exit('STOP: Sidebar/view patch could not be verified. No changes made.')
for path in (api,page,css):
    if path.exists():sys.exit(f'STOP: Existing {path}; no files changed.')

backup = root / '.curvtab-settings-backups' / datetime.now().strftime('%Y%m%d-%H%M%S-%f')
backup.mkdir(parents=True)
shutil.copy2(app,backup/'App.tsx')
app.write_text(updated)
api.parent.mkdir(parents=True,exist_ok=True);api.write_text(api_text)
page.parent.mkdir(parents=True,exist_ok=True);page.write_text(page_text)
css.write_text(css_text)
print('SUCCESS: PracticeAdmin-only Practice Settings UI and API added.')
print('Settings: practice name, email, phone, address. Existing database table; NO migration.')
print('Existing staff management and other roles untouched.')
print('Backup:',backup)
print('NEXT: dotnet build backend/CurvTabDental.API/CurvTabDental.API.csproj')
print('NEXT: cd frontend && npm run build && npm run lint')
