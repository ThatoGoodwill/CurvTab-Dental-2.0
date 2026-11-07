import { useCallback, useEffect, useState } from 'react'
import './WhatsAppPanel.css'

type Message = {
  id: string
  patientId: string
  appointmentId: string
  templateKey: string
  status: string
  appointmentStartUtc: string
  createdAtUtc: string
}

const base = '/api/whatsapp'

async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(base + path, {
    method,
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const raw = await response.text()
  let json: unknown = {}
  if (raw) {
    try { json = JSON.parse(raw) as unknown } catch { /* response may not be JSON */ }
  }
  if (!response.ok) {
    const error = json as { message?: string; title?: string }
    throw new Error(error?.message || error?.title || `HTTP ${response.status}`)
  }
  return json as T
}

export default function WhatsAppPanel() {
  const [patientId, setPatientId] = useState('')
  const [appointmentId, setAppointmentId] = useState('')
  const [consentSource, setConsentSource] = useState('Patient confirmed in person')
  const [consent, setConsent] = useState<string>('Not checked')
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    try { setMessages(await request<Message[]>('/messages')) }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to load messages') }
  }, [])
  useEffect(() => { void load() }, [load])

  async function perform(action: () => Promise<void>) {
    setBusy(true)
    setStatus('')
    try { await action() }
    catch (e) { setStatus(e instanceof Error ? e.message : 'Request failed') }
    finally { setBusy(false) }
  }

  return <section className="ct-wa" aria-label="WhatsApp mock reminder management">
    <h2>WhatsApp reminders</h2>
    <p><strong>Mock mode — no messages are sent.</strong> Record separate WhatsApp consent and test reminder queuing before connecting a provider.</p>
    <div className="ct-wa-grid">
      <div className="ct-wa-card">
        <h3>Patient WhatsApp consent</h3>
        <label>Patient ID<input value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="Patient UUID" /></label>
        <label>Consent evidence/source<input value={consentSource} maxLength={100} onChange={e => setConsentSource(e.target.value)} /></label>
        <p aria-live="polite">Consent: {consent}</p>
        <div className="ct-wa-actions">
          <button disabled={busy || !patientId.trim()} onClick={() => void perform(async () => {
            const data = await request<{ optedIn: boolean }>(`/consents/${encodeURIComponent(patientId.trim())}`)
            setConsent(data.optedIn ? 'Opted in' : 'Not opted in')
          })}>Check</button>
          <button disabled={busy || !patientId.trim() || !consentSource.trim()} onClick={() => void perform(async () => {
            await request(`/consents/${encodeURIComponent(patientId.trim())}`, 'PUT', { optedIn: true, source: consentSource })
            setConsent('Opted in')
            setStatus('WhatsApp opt-in recorded')
          })}>Record opt-in</button>
          <button disabled={busy || !patientId.trim() || !consentSource.trim()} onClick={() => void perform(async () => {
            await request(`/consents/${encodeURIComponent(patientId.trim())}`, 'PUT', { optedIn: false, source: consentSource })
            setConsent('Opted out')
            setStatus('WhatsApp opt-out recorded')
          })}>Record opt-out</button>
        </div>
      </div>
      <div className="ct-wa-card">
        <h3>Queue fictional reminder</h3>
        <p>Requires an upcoming scheduled appointment and explicit patient WhatsApp consent. This action only saves a mock record.</p>
        <label>Appointment ID<input value={appointmentId} onChange={e => setAppointmentId(e.target.value)} placeholder="Appointment UUID" /></label>
        <button disabled={busy || !appointmentId.trim()} onClick={() => void perform(async () => {
          await request('/mock-reminders', 'POST', { appointmentId: appointmentId.trim() })
          setStatus('Mock reminder queued; nothing sent')
          await load()
        })}>Queue mock reminder</button>
      </div>
    </div>
    {status && <p role="status" className="ct-wa-status">{status}</p>}
    <div className="ct-wa-card">
      <div className="ct-wa-title"><h3>Recent mock messages</h3><button disabled={busy} onClick={() => void load()}>Refresh</button></div>
      {messages.length === 0 ? <p>No reminders queued yet.</p> : <div className="ct-wa-scroll"><table>
        <thead><tr><th>Status</th><th>Appointment</th><th>Appointment time (UTC)</th><th>Created (UTC)</th></tr></thead>
        <tbody>{messages.map(x => <tr key={x.id}><td>{x.status}</td><td>{x.appointmentId}</td><td>{new Date(x.appointmentStartUtc).toLocaleString()}</td><td>{new Date(x.createdAtUtc).toLocaleString()}</td></tr>)}</tbody>
      </table></div>}
    </div>
  </section>
}
