#!/usr/bin/env python3
"""Targeted SuperAdmin Dental Practices UI patch for CurvTab Dental 2.0.
Only replaces type Practice + DentalPracticesPage in frontend/src/App.tsx.
"""
from pathlib import Path
from datetime import datetime, timezone
import shutil
import sys

root = Path.cwd()
app = root / 'frontend/src/App.tsx'
if not app.is_file():
    sys.exit('ERROR: Run from the CurvTab-Dental-2.0 project root; frontend/src/App.tsx not found. Nothing changed.')
original = app.read_text(encoding='utf-8')
start_mark = 'type Practice = {'
end_mark = '// =========================================\n// APP\n// ========================================='
if original.count(start_mark) != 1 or original.count(end_mark) != 1:
    sys.exit('ERROR: Expected unique DentalPracticesPage markers not found. Nothing changed.')
start, end = original.index(start_mark), original.index(end_mark)
old = original[start:end]
if 'function DentalPracticesPage()' not in old or "'/platform/practices'" not in old:
    sys.exit('ERROR: Unexpected DentalPracticesPage structure. Nothing changed.')
if 'Register a practice' in old and 'adminTemporaryPassword' in old:
    sys.exit('Already installed. Nothing changed.')

replacement = r'''type Practice = {
  id: string
  name: string
  isActive: boolean
}

// SuperAdmin only: the parent App controls access to this page.
// The ASP.NET Core API also enforces SuperAdmin authorization.
function DentalPracticesPage() {
  const [practices, setPractices] = useState<Practice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    address: '',
    adminFullName: '',
    adminEmail: '',
    adminTemporaryPassword: '',
    confirmPassword: '',
  })

  function update(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  useEffect(() => {
    let cancelled = false
    apiRequest<unknown>('/platform/practices')
      .then((response) => {
        if (!Array.isArray(response)) throw new Error('Unexpected practices response.')
        const result: Practice[] = response.map((value: unknown) => {
          if (!value || typeof value !== 'object') throw new Error('Invalid practice record.')
          const row = value as Record<string, unknown>
          if (typeof row.id !== 'string' ||
              typeof row.name !== 'string' ||
              typeof row.isActive !== 'boolean') {
            throw new Error('Incomplete practice record.')
          }
          return { id: row.id, name: row.name, isActive: row.isActive }
        })
        if (!cancelled) { setPractices(result); setError('') }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load practices.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadKey])

  async function registerPractice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setFormError('')
    setNotice('')
    const trimmedName = form.name.trim()
    const fullName = form.adminFullName.trim()
    const email = form.adminEmail.trim().toLowerCase()
    if (!trimmedName || !fullName || !email) {
      setFormError('Practice name, administrator name and administrator email are required.')
      return
    }
    if (form.adminTemporaryPassword.length < 10 ||
        !/[A-Z]/.test(form.adminTemporaryPassword) ||
        !/[a-z]/.test(form.adminTemporaryPassword) ||
        !/[0-9]/.test(form.adminTemporaryPassword)) {
      setFormError('Temporary password needs at least 10 characters, upper/lowercase letters and a digit.')
      return
    }
    if (form.adminTemporaryPassword !== form.confirmPassword) {
      setFormError('Temporary passwords do not match.')
      return
    }
    setSaving(true)
    try {
      await apiRequest<unknown>('/platform/practices', 'POST', {
        name: trimmedName,
        email: form.email.trim() || null,
        phoneNumber: form.phoneNumber.trim() || null,
        address: form.address.trim() || null,
        adminFullName: fullName,
        adminEmail: email,
        adminTemporaryPassword: form.adminTemporaryPassword,
      })
      setNotice(`${trimmedName} created. The new administrator must change their temporary password at first sign-in.`)
      setForm({ name: '', email: '', phoneNumber: '', address: '', adminFullName: '', adminEmail: '', adminTemporaryPassword: '', confirmPassword: '' })
      setShowForm(false)
      setLoading(true)
      setReloadKey((value) => value + 1)
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Unable to register the practice.')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '12px 13px', border: '1px solid #cfdded',
    borderRadius: 11, background: '#fff', color: '#213653', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 7, fontWeight: 600, fontSize: 13,
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SAAS PLATFORM</div>
          <h1>Dental Practices</h1>
          <p>Register and manage dental practices on CurvTab Dental.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="secondary-button" onClick={() => {
            setLoading(true); setReloadKey((value) => value + 1)
          }}>
            <RefreshCw size={17} /> Refresh
          </button>
          <button type="button" className="primary-button" aria-expanded={showForm}
            onClick={() => { setShowForm((value) => !value); setFormError('') }}>
            {showForm ? 'Close registration' : '+ Register Practice'}
          </button>
        </div>
      </div>

      {notice && <section className="panel" role="status" style={{ borderColor: '#a5dfc2', marginBottom: 18 }}>
        <p style={{ color: '#176b42', margin: 0 }}>{notice}</p>
      </section>}

      {showForm && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div><h2>Register a practice</h2><p>Create a practice and its first PracticeAdmin account.</p></div>
            <Building2 size={21} />
          </div>
          <form onSubmit={(event) => void registerPractice(event)} style={{ display: 'grid', gap: 18 }}>
            <h3 style={{ margin: 0 }}>Practice details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15 }}>
              <label style={labelStyle}>Practice name *
                <input style={fieldStyle} required maxLength={200} value={form.name}
                  onChange={(event) => update('name', event.target.value)} placeholder="Sunrise Dental Clinic" />
              </label>
              <label style={labelStyle}>Practice contact email
                <input style={fieldStyle} type="email" maxLength={256} value={form.email}
                  onChange={(event) => update('email', event.target.value)} placeholder="contact@example.com" />
              </label>
              <label style={labelStyle}>Contact number
                <input style={fieldStyle} type="tel" maxLength={40} value={form.phoneNumber}
                  onChange={(event) => update('phoneNumber', event.target.value)} placeholder="011 000 1234" />
              </label>
              <label style={labelStyle}>Address
                <input style={fieldStyle} maxLength={500} value={form.address}
                  onChange={(event) => update('address', event.target.value)} placeholder="City and street address" />
              </label>
            </div>
            <h3 style={{ margin: '2px 0 0' }}>First Practice Administrator</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15 }}>
              <label style={labelStyle}>Administrator full name *
                <input style={fieldStyle} required maxLength={200} value={form.adminFullName}
                  onChange={(event) => update('adminFullName', event.target.value)} placeholder="Dr Test Admin" />
              </label>
              <label style={labelStyle}>Administrator login email *
                <input style={fieldStyle} required type="email" maxLength={256} value={form.adminEmail}
                  onChange={(event) => update('adminEmail', event.target.value)} placeholder="admin@example.com" />
              </label>
              <label style={labelStyle}>Temporary password *
                <input style={fieldStyle} required type="password" minLength={10} autoComplete="new-password"
                  value={form.adminTemporaryPassword}
                  onChange={(event) => update('adminTemporaryPassword', event.target.value)} />
              </label>
              <label style={labelStyle}>Confirm temporary password *
                <input style={fieldStyle} required type="password" minLength={10} autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(event) => update('confirmPassword', event.target.value)} />
              </label>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#60748e' }}>
              The administrator will be required to change their temporary password on first login.
              Secure email invitations can replace temporary passwords in a later release.
            </p>
            {formError && <p role="alert" style={{ color: '#ad2431', margin: 0 }}>{formError}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? 'Registering...' : 'Create Practice'}
              </button>
              <button className="secondary-button" type="button" disabled={saving} onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Practice Directory</h2>
          <Building2 size={21} />
        </div>
        {loading && <p>Loading practices...</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && practices.length === 0 && <p>No practices registered yet.</p>}
        {!loading && !error && (
          <div className="check-list">
            {practices.map((practice) => (
              <div key={practice.id}>
                <strong>{practice.name}</strong>{' — '}
                {practice.isActive ? 'Active' : 'Inactive'}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

'''
backup_dir = root / '.curvtab-registration-backups'
backup_dir.mkdir(exist_ok=True)
backup = backup_dir / f'App-{datetime.now(timezone.utc):%Y%m%d-%H%M%S-%f}.tsx'
shutil.copy2(app, backup)
app.write_text(original[:start] + replacement + original[end:], encoding='utf-8')
print('SUCCESS: Register Practice UI added to SuperAdmin Dental Practices.')
print(f'Backup: {backup}')
print('Next: cd frontend && npm run build && npm run lint')
