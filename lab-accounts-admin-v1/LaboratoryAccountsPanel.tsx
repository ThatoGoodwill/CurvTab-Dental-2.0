import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Building2, Link2, RefreshCw, ShieldCheck } from 'lucide-react'
import { apiRequest } from '../services/api'
import './LaboratoryAccountsPanel.css'

type Partner = { id: string; name: string; contact: string | null; phone: string | null; isActive: boolean }
type Staff = { id: string; fullName: string; email: string; role: string; isActive: boolean }
type Dashboard = { partners: Partner[] }

/** PracticeAdmin controls real laboratory partners and separately provisioned technicians. */
export default function LaboratoryAccountsPanel() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [technicians, setTechnicians] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [technicianId, setTechnicianId] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [dashboard, staff] = await Promise.all([
        apiRequest<Dashboard>('/laboratory/dashboard'),
        apiRequest<Staff[]>('/staff'),
      ])
      setPartners(dashboard.partners ?? [])
      setTechnicians(staff.filter(person => person.role === 'LabTechnician' && person.isActive))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load laboratory accounts.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void reload() }, [reload])
  const activePartners = useMemo(() => partners.filter(p => p.isActive), [partners])

  async function createPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) { setError('Enter a laboratory name.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await apiRequest('/laboratory/partners', 'POST', { name: name.trim(), contact: contact.trim(), phone: phone.trim() })
      setName(''); setContact(''); setPhone('')
      setMessage('Laboratory partner added. Create a Lab Technician under Add Employee, then assign the account below.')
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add laboratory.')
    } finally { setBusy(false) }
  }

  async function assignAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!partnerId || !technicianId) { setError('Choose both a laboratory and a technician.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      await apiRequest(`/laboratory/partners/${encodeURIComponent(partnerId)}/members`, 'POST', { userId: technicianId })
      setMessage('Lab Technician account assigned. Their laboratory access is limited by the backend assignment rules.')
      setTechnicianId('')
      await reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to assign technician.')
    } finally { setBusy(false) }
  }

  return (
    <section className="lab-accounts-panel" aria-label="Laboratory partners and accounts">
      <div className="lab-accounts-heading"><div><h2>Laboratory Partners & Accounts</h2><p>Set up actual laboratory suppliers and link their technician login to the correct laboratory.</p></div>
        <button type="button" className="lab-accounts-refresh" disabled={busy || loading} onClick={() => void reload()}><RefreshCw size={15}/> Refresh</button>
      </div>
      {error && <p role="alert" className="lab-accounts-error">{error}</p>}
      {message && <p role="status" className="lab-accounts-success">{message}</p>}
      <div className="lab-accounts-grid">
        <form onSubmit={createPartner} className="lab-accounts-card">
          <h3><Building2 size={18}/> Register laboratory partner</h3>
          <label htmlFor="lab-partner-name">Laboratory name</label><input required id="lab-partner-name" maxLength={160} value={name} onChange={e => setName(e.target.value)} placeholder="Registered laboratory name" />
          <label htmlFor="lab-partner-contact">Contact person</label><input id="lab-partner-contact" maxLength={120} value={contact} onChange={e => setContact(e.target.value)} placeholder="Lab contact" />
          <label htmlFor="lab-partner-phone">Phone number</label><input id="lab-partner-phone" maxLength={50} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Contact number" />
          <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add laboratory'}</button>
          <p className="lab-accounts-hint">{loading ? 'Loading laboratories…' : `${activePartners.length} active laboratory partner${activePartners.length === 1 ? '' : 's'}`}{activePartners.length > 0 && <>: {activePartners.map(p => p.name).join(', ')}</>}</p>
        </form>
        <form onSubmit={assignAccount} className="lab-accounts-card">
          <h3><Link2 size={18}/> Assign laboratory technician</h3>
          <p className="lab-accounts-hint">First create a staff login using the <strong>Lab Technician</strong> role in Add Employee above. Then link the account here.</p>
          <label htmlFor="lab-partner-select">Laboratory partner</label>
          <select id="lab-partner-select" required value={partnerId} onChange={e => setPartnerId(e.target.value)}><option value="">Choose laboratory</option>{activePartners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <label htmlFor="lab-technician-select">Active Lab Technician account</label>
          <select id="lab-technician-select" required value={technicianId} onChange={e => setTechnicianId(e.target.value)}><option value="">Choose account</option>{technicians.map(t => <option key={t.id} value={t.id}>{t.fullName} ({t.email})</option>)}</select>
          <button type="submit" disabled={busy || loading || !activePartners.length || !technicians.length}>{busy ? 'Saving…' : 'Assign account'}</button>
          <p className="lab-accounts-hint"><ShieldCheck size={14}/> Account creation and assignment are saved to the existing API with practice-level permissions.</p>
        </form>
      </div>
      <p className="lab-accounts-footnote">Do not give external suppliers access to real patient information until cross-organisation security and confidentiality controls are tested.</p>
    </section>
  )
}
