import { useEffect, useState } from 'react'
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
