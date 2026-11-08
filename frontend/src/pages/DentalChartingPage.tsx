import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity, Plus, RefreshCw, Save } from 'lucide-react'
import { apiRequest } from '../services/api'
import { loadClinicalPatients } from '../utils/clinicalPatients'
import type { ClinicalPatient } from '../utils/clinicalPatients'
import ClinicalImagingPanel from './ClinicalImagingPanel'
import RecoveredClinicalWorkspace from './RecoveredClinicalWorkspace'
import './DentistSpecialties.css'
import './ClinicalPhase4.css'
import './InteractiveOdontogram.css'
import './OdontogramShapeV2.css'
import './DentalChartingNavigation.css'

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


// CT_INTERACTIVE_ODONTOGRAM
// Colours represent recorded observations, not automated diagnoses.
function findingColour(value?: string): string {
  switch (value) {
    case 'Caries suspected': return '#e34d59'
    case 'Restoration present': return '#eab308'
    case 'Crown present': return '#8b5cf6'
    case 'Root canal treated': return '#db2777'
    case 'Fracture': return '#f97316'
    case 'Missing': return '#64748b'
    case 'Extraction planned': return '#ef4444'
    case 'Sealant present': return '#0ea5e9'
    case 'Monitor': return '#f59e0b'
    case 'Healthy': return '#2aa879'
    case 'Other': return '#a78bfa'
    default: return 'transparent'
  }
}

export default function DentalChartingPage({
  initialPatientId,
}: {
  initialPatientId?: string | null
}) {
  const [clinicalTab, setClinicalTab] = useState<'Dental Chart' | 'Treatment Plan' | 'Clinical Notes & Encounters' | 'Medical Records' | 'Clinical Images' | 'Tooth History'>('Dental Chart')
  const [patients, setPatients] = useState<ClinicalPatient[]>([])
  const [patientSearch, setPatientSearch] = useState('')
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
        setPatientId(initialPatientId && rows.some(row => row.id === initialPatientId) ? initialPatientId : '')
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
    setLoading(Boolean(id))
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
      const selected = toothCode === key

      // FDI positions 1-3 are anterior teeth.
      const anterior = Number(key[1]) <= 3
      const centreSurface = anterior ? 'Incisal' : 'Occlusal'

      // FDI quadrants: mesial faces the midline.
      // These positions describe the displayed chart, not a radiograph.
      const mesialOnRight = ['1', '4', '5', '8'].includes(key[0])
      const upperArch = ['1', '2', '5', '6'].includes(key[0])

      const surfacesForTooth = [
        { name: 'Buccal', position: upperArch ? 'top' : 'bottom' },
        { name: 'Mesial', position: mesialOnRight ? 'right' : 'left' },
        { name: centreSurface, position: 'centre' },
        { name: 'Distal', position: mesialOnRight ? 'left' : 'right' },
        { name: 'Lingual', position: upperArch ? 'bottom' : 'top' },
      ]

      // The API returns newest entries first.
      // Find the most recent recorded observation for each surface.
      const toothEntries = entries.filter(entry =>
        entry.toothCode === key
      )

      function selectToothSurface(surfaceName: string) {
        setToothCode(key)
        setSurface(surfaceName)
        setSuccess('')
      }

      return (
        <div
          key={key}
          className={`ct-odonto-tooth ${selected ? 'is-selected' : ''}`}
          role="group"
          aria-label={`Tooth ${key}`}
        >
          <span className="ct-odonto-number">{key}</span>

          <div className="ct-odonto-surfaces">
            {surfacesForTooth.map(item => {
              const recorded = toothEntries.find(entry =>
                entry.surface === item.name
              )
              const wholeTooth = toothEntries.find(entry =>
                entry.surface === 'Whole Tooth'
              )
              const displayed = recorded ?? wholeTooth
              const active =
                selected && surface === item.name

              return (
                <button
                  key={item.position}
                  type="button"
                  className={`ct-odonto-surface ct-odonto-${item.position}
                    ${active ? 'is-active' : ''}`}
                  style={{
                    backgroundColor: findingColour(displayed?.finding),
                  }}
                  aria-label={
                    `Tooth ${key}, ${item.name}` +
                    (displayed
                      ? `, recorded finding: ${displayed.finding}`
                      : ', no recorded finding')
                  }
                  aria-pressed={active}
                  title={
                    `Tooth ${key} — ${item.name}` +
                    (displayed ? ` — ${displayed.finding}` : '')
                  }
                  onClick={() => selectToothSurface(item.name)}
                />
              )
            })}
          </div>

          {last && (
            <span
              className="ct-odonto-record"
              title={`${last.finding} — ${last.surface}`}
            >
              <span className="ct-odonto-record-dot"
                style={{ backgroundColor: findingColour(last.finding) }}
              />
            </span>
          )}
        </div>
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
        {patientId && (
          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={() => {
              setLoading(true)
              setReload(value => value + 1)
            }}
          >
            <RefreshCw size={17} /> Refresh
          </button>
        )}
      </div>

      {error && <div className="specialty-alert specialty-error" role="alert">{error}</div>}
      {success && <div className="specialty-alert specialty-success" role="status">{success}</div>}

      
      {/* CT_CHARTING_PATIENT_NAV_V1 */}
      {!patientId ? (
        <section className="ct-chart-select">
          <div className="ct-chart-select-heading">
            <div className="ct-chart-select-icon">
              <Activity size={28} />
            </div>
            <h2>Select a Patient to Chart</h2>
            <p>
              Search for a registered patient to open
              their dental chart and clinical history.
            </p>
          </div>

          <input
            type="search"
            className="ct-chart-patient-search"
            value={patientSearch}
            onChange={event => setPatientSearch(event.target.value)}
            placeholder="Search patients..."
            aria-label="Search patients for dental charting"
          />

          <div className="ct-chart-patient-results">
            {patients
              .filter(patient =>
                patient.name.toLowerCase().includes(
                  patientSearch.trim().toLowerCase()
                )
              )
              .map(patient => (
                <button
                  type="button"
                  key={patient.id}
                  className="ct-chart-patient-option"
                  onClick={() => selectPatient(patient.id)}
                >
                  <span className="ct-chart-patient-avatar">
                    {patient.name.trim().split(/\s+/)
                      .slice(0, 2)
                      .map(part => part.charAt(0).toUpperCase())
                      .join('')}
                  </span>
                  <span className="ct-chart-patient-name">
                    <strong>{patient.name}</strong>
                    <small>Registered patient</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}

            {patients.length === 0 && (
              <p className="ct-chart-select-empty">
                No patients available in the directory.
              </p>
            )}

            {patients.length > 0 &&
              !patients.some(patient =>
                patient.name.toLowerCase().includes(
                  patientSearch.trim().toLowerCase()
                )
              ) && (
                <p className="ct-chart-select-empty">
                  No patients match your search.
                </p>
              )}
          </div>
        </section>
      ) : (
        <section className="ct-chart-workspace-heading">
          <button
            type="button"
            className="ct-chart-change-patient"
            onClick={() => selectPatient('')}
          >
            ← Change Patient
          </button>

          <div className="ct-chart-workspace-identity">
            <div className="ct-chart-workspace-avatar">
              {patients.find(p => p.id === patientId)
                ?.name.charAt(0).toUpperCase() || 'P'}
            </div>

            <div>
              <h2>
                {patients.find(p => p.id === patientId)
                  ?.name || 'Patient Dental Chart'}
              </h2>
              <p>
                Dental Chart · Clinical Imaging · Observations
              </p>
            </div>
          </div>
        </section>
      )}


      
      {patientId && <nav className="ct-recovered-tabs" aria-label="Patient treatment workspace">
        {(['Dental Chart', 'Treatment Plan', 'Clinical Notes & Encounters', 'Medical Records', 'Clinical Images', 'Tooth History'] as const).map(name =>
          <button key={name} type="button" aria-pressed={clinicalTab === name}
            onClick={() => setClinicalTab(name)}>{name}</button>
        )}
      </nav>}
      {patientId && (clinicalTab === 'Treatment Plan' || clinicalTab === 'Clinical Notes & Encounters' || clinicalTab === 'Medical Records') &&
        <RecoveredClinicalWorkspace key={`${patientId}-${clinicalTab}`} patientId={patientId} panel={clinicalTab} />}

      {patientId && clinicalTab === 'Tooth History' &&
        <section className="ct-recovered-panel"><h2>Tooth History</h2>
          <p>Tooth {toothCode} · previous recorded observations</p>
          {toothHistory.length === 0 ? <p>No observations for this tooth.</p> :
            toothHistory.map(item => <article className="ct-recovered-card" key={item.id}>
              <strong>{item.finding} · {item.surface}</strong><p>{item.notes || 'No notes.'}</p><small>{formatDate(item.recordedAtUtc)}</small>
            </article>)}
        </section>}

      {patientId && clinicalTab === 'Clinical Images' && (
        <ClinicalImagingPanel
          key={patientId}
          patientId={patientId}
        />
      )}

      {patientId && clinicalTab === 'Dental Chart' && <div className="specialty-columns">
        <section className="panel specialty-chart-panel">
          <div className="panel-header"><div><h2>FDI Tooth Chart</h2><p>Adult and primary dentition</p></div><Activity size={20}/></div>
          <div className="specialty-switch">
            <button type="button" className={dentition === 'permanent' ? 'primary-button' : 'secondary-button'}
              onClick={() => selectDentition('permanent')}>Permanent (32)</button>
            <button type="button" className={dentition === 'primary' ? 'primary-button' : 'secondary-button'}
              onClick={() => selectDentition('primary')}>Primary (20)</button>
          </div>
          <p className="specialty-hint">Select the tooth number. A dot marks a recorded finding. This is a clinical charting aid, not an automated diagnosis.</p>
          {/* CT_CLINICAL_PHASE4 */}
          <div className="ct-chart-guide" aria-label="Chart finding legend">
            <strong>Clinical chart guide</strong>
            <div className="ct-chart-legend">
              <span><i className="ct-legend-blue" /> Healthy / observed</span>
              <span><i className="ct-legend-red" /> Possible caries</span>
              <span><i className="ct-legend-amber" /> Requires review</span>
              <span><i className="ct-legend-purple" /> Restored / treated</span>
            </div>
            <p>
              These colours explain possible finding categories.
              Recorded findings remain in the patient's history.
              Colours are not automatic diagnoses.
            </p>
          </div>
          <div className="specialty-jaws ct-clinical-arches">
            <div><strong>Upper arch</strong><div className="specialty-tooth-grid">{toothButtons(dentition === 'permanent' ? permanentUpper : primaryUpper)}</div></div>
            <div><strong>Lower arch</strong><div className="specialty-tooth-grid">{toothButtons(dentition === 'permanent' ? permanentLower : primaryLower)}</div></div>
          </div>
          <div className="specialty-history">
            <h3>Tooth {toothCode} · Clinical history</h3>
            <p className="ct-chart-history-help">
              Previous observations are retained for clinical review.
            </p>
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
