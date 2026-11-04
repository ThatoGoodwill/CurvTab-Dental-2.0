import { useEffect, useMemo, useState } from 'react'
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

export default function DentalChartingPage({
  initialPatientId,
}: {
  initialPatientId?: string | null
}) {
  const [patients, setPatients] = useState<ClinicalPatient[]>([])
  const [patientId, setPatientId] = useState(initialPatientId ?? '')
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
        if (rows.length > 0) setPatientId(
          initialPatientId && rows.some(row => row.id === initialPatientId)
            ? initialPatientId
            : rows[0].id
        )
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
