import './TreatmentLanding.css'
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
  initialClinicalTab = 'Dental Chart',
  onOpenLaboratory,
  onOpenTreatmentPlan,
}: {
  initialPatientId?: string | null
  onOpenLaboratory?: (patientId: string) => void
  onOpenTreatmentPlan?: () => void
  initialClinicalTab?: 'Dental Chart' | 'Treatment Plan' | 'Clinical Notes & Encounters' | 'Medical Records' | 'Clinical Images' | 'Tooth History'
}) {
  const [clinicalTab, setClinicalTab] = useState<'Treatment Home' | 'Dental Chart' | 'Treatment Plan' | 'Clinical Notes & Encounters' | 'Medical Records' | 'Clinical Images' | 'Tooth History'>(initialClinicalTab)
  const [patients, setPatients] = useState<ClinicalPatient[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [patientId, setPatientId] = useState(initialPatientId ?? '')
  const [dentition, setDentition] = useState<'permanent' | 'primary'>('permanent')
  const [toothCode, setToothCode] = useState('11')
  const [toothChosen, setToothChosen] = useState(false)
  // CT_TREATMENT_LANDING_V1
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
    setToothChosen(false)
    setClinicalTab(initialClinicalTab)
  }, [patientId])



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
      const selected = toothChosen && toothCode === key

      // FDI positions 1-3 are anterior teeth.
      const anterior = Number(key[1]) <= 3
      const centreSurface = anterior ? 'Incisal' : 'Occlusal'

      // FDI quadrants: mesial faces the midline.
      // These positions describe the displayed chart, not a radiograph.
      const mesialOnRight = ['1', '4', '5', '8'].includes(key[0])
      const upperArch = ['1', '2', '5', '6'].includes(key[0])



      // CT_CLIENT_TOOTH_REFERENCE_V2
      // Crown faces upward in the lower arch and downward
      // in the upper arch. These are illustrative shapes.
      const toothPosition = Number(key[1])
      const isPrimary = Number(key[0]) >= 5

      const toothShape =
        toothPosition <= 2
          ? 'M7 10 C7 5 10 3 16 3 C22 3 25 5 25 10 C25 16 23 21 21 25 C20 31 19 39 18 45 C17 49 15 49 14 45 C13 39 12 31 11 25 C9 21 7 16 7 10 Z'
          : toothPosition === 3
            ? 'M7 12 C8 8 12 5 16 2 C20 5 24 8 25 12 C25 18 22 23 20 28 C19 34 19 43 17 48 C16 50 14 49 14 46 C13 39 13 33 11 28 C9 23 7 18 7 12 Z'
            : toothPosition <= 5 && !isPrimary
              ? 'M5 11 C5 6 8 4 12 5 C14 3 17 3 20 5 C25 4 28 7 27 12 C27 19 24 25 21 29 C20 34 21 42 19 47 C18 49 16 47 15 42 C14 39 13 39 13 43 C12 48 10 49 9 45 C8 40 10 34 10 29 C7 25 5 19 5 11 Z'
              : 'M3 12 C3 7 6 4 10 5 C12 3 15 3 17 5 C20 3 24 4 27 6 C30 9 29 15 28 21 C27 26 25 29 24 32 C25 39 26 45 23 48 C21 49 19 44 17 39 C16 36 15 37 14 41 C12 47 10 49 8 47 C6 44 8 38 8 32 C5 27 3 20 3 12 Z'

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
        setToothChosen(true)
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

          
          <svg
            className={
              upperArch
                ? 'ct-real-tooth ct-real-tooth-upper'
                : 'ct-real-tooth ct-real-tooth-lower'
            }
            viewBox="0 0 32 52"
            aria-hidden="true"
            focusable="false"
          >
            <path className="ct-real-tooth-body" d={toothShape}/>
            <path
              className="ct-real-tooth-shine"
              d="M11 11 Q14 9 17 11"
            />
          </svg>

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
      setSuccess(`Tooth ${toothCode} observation saved. Next: open Treatment Plan to add the actual procedure.`)
      setNotes('')
      setToothChosen(false)
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
        <div><div className="eyebrow">DENTIST · CLINICAL RECORDS</div><h1>
              {clinicalTab === 'Treatment Home'
                ? 'Treatment'
                : clinicalTab}
            </h1>
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
      {success && <div className="specialty-alert specialty-success ct-chart-next-step" role="status">
        <strong>{success}</strong>
        <button type="button" className="primary-button" onClick={() => { setClinicalTab('Treatment Plan'); setSuccess(''); onOpenTreatmentPlan?.() }}>Continue to Treatment Plan →</button>
      </div>}

      
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
        <button
          type="button"
          aria-pressed={clinicalTab === 'Treatment Home'}
          onClick={() => setClinicalTab(initialClinicalTab)}
        >
          Treatment Home
        </button>

        {(['Dental Chart', 'Treatment Plan', 'Clinical Notes & Encounters', 'Medical Records', 'Clinical Images'] as const).map(name =>
          <button key={name} type="button" aria-pressed={clinicalTab === name}
            onClick={() => setClinicalTab(name)}>{name}</button>
        )}
      </nav>}

      {patientId && clinicalTab === 'Treatment Home' && (
        <section
          className="ct-treatment-home"
          aria-label="Patient treatment sections"
        >
          <div className="ct-treatment-intro">
            <h2>Treatment workspace</h2>
            <p>Select a clinical section to begin.</p>
          </div>

          <div className="ct-treatment-menu">
            {([
              ['Dental Chart', 'Select teeth and record observations'],
              ['Medical Records', 'Review patient medical information'],
              ['Treatment Plan', 'Plan and manage procedures'],
              ['Clinical Notes & Encounters', 'Clinical consultations and notes'],
              ['Clinical Images', 'View patient clinical imaging'],

            ] as const).map(([name, description]) => (
              <button
                type="button"
                key={name}
                className="ct-treatment-option"
                onClick={() => {
                  setToothChosen(false)
                  setClinicalTab(name)
                }}
              >
                <strong>{name}</strong>
                <span>{description}</span>
                <span className="ct-treatment-option-arrow">
                  Open →
                </span>
              </button>
            ))}
          </div>
        </section>
      )}


      {/* CT_TOOTH_HISTORY_INSIDE_MEDICAL_V1 */}
      {patientId &&
        (clinicalTab === 'Treatment Plan' ||
         clinicalTab === 'Clinical Notes & Encounters' ||
         clinicalTab === 'Medical Records') && (
          <>
            <RecoveredClinicalWorkspace
              key={`${patientId}-${clinicalTab}`}
              patientId={patientId}
              panel={clinicalTab}
              onOpenLaboratory={onOpenLaboratory}
            />

            {clinicalTab === 'Medical Records' && (
              <div className="ct-recovered-panel">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setClinicalTab('Tooth History')}
                >
                  View Tooth History →
                </button>
              </div>
            )}
          </>
        )}

      {patientId && clinicalTab === 'Tooth History' &&
        <section className="ct-recovered-panel">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setClinicalTab('Medical Records')}
          >
            ← Back to Medical Records
          </button>
          <h2>Tooth History</h2>
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

      {patientId && clinicalTab === 'Dental Chart' &&
        <div className={
          toothChosen
            ? 'specialty-columns ct-treatment-chart'
            : 'specialty-columns ct-treatment-chart ct-treatment-no-tooth'
        }>
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
            <div><strong>Upper arch</strong><div className="specialty-tooth-grid" onClickCapture={(event) => { const target = event.target as HTMLElement; if (target.closest("button, [role=button]")) setToothChosen(true) }}>{toothButtons(dentition === 'permanent' ? permanentUpper : primaryUpper)}</div></div>
            <div><strong>Lower arch</strong><div className="specialty-tooth-grid" onClickCapture={(event) => { const target = event.target as HTMLElement; if (target.closest("button, [role=button]")) setToothChosen(true) }}>{toothButtons(dentition === 'permanent' ? permanentLower : primaryLower)}</div></div>
          </div>
          <div className="specialty-history" hidden={!toothChosen}>
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
        {toothChosen && <section className="panel specialty-form-panel">
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
        </section>}
      </div>}
    </div>
  )
}
