import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ClipboardList, Plus, RefreshCw, Save } from 'lucide-react'
import { apiRequest } from '../services/api'
import { loadClinicalPatients } from '../utils/clinicalPatients'
import type { ClinicalPatient } from '../utils/clinicalPatients'
import ClinicalImagingPanel from './ClinicalImagingPanel'
import OrthodonticFinancials from './OrthodonticFinancials'
import './DentistSpecialties.css'
import './ClinicalPhase4.css'
import OrthodonticCareTimeline from './OrthodonticCareTimeline'
import OrthoHub from './OrthoHub'
import './OrthodonticsDashboard.css'

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
  // CT_ORTHO_FINANCIALS_TAB
  // CT_ORTHO_DASHBOARD_V1
  const [activeTab, setActiveTab] = useState<
    'Dashboard' | 'Cases' | 'Patients' | 'Reports' | 'Analysis'
  >('Dashboard')

  const [openNewCase, setOpenNewCase] = useState(false)

  useEffect(() => {
    if (activeTab !== 'Patients' || !openNewCase) return

    const frame = requestAnimationFrame(() => {
      const form = document.getElementById('ct-ortho-new-case')
      form?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      form?.querySelector<HTMLInputElement>('input')?.focus({
        preventScroll: true
      })
      setOpenNewCase(false)
    })

    return () => cancelAnimationFrame(frame)
  }, [activeTab, openNewCase])

  const [workspaceTab, setWorkspaceTab] =
    useState<'Clinical' | 'Financials'>('Clinical')
  const [patients, setPatients] = useState<ClinicalPatient[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [patientWorkspaceOpen, setPatientWorkspaceOpen] = useState(false)

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
    setPatientWorkspaceOpen(true)

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


  // CT_ORTHO_PHASE4
  const activeCases = cases.filter(item => item.status === 'Active').length
  const planningCases = cases.filter(item => item.status === 'Planning').length
  const completedCases = cases.filter(item => item.status === 'Completed').length
  const upcomingReviews = cases
    .filter(item =>
      item.nextReviewDate !== null &&
      item.nextReviewDate >= localDate() &&
      item.status !== 'Completed'
    )
    .sort((a, b) =>
      (a.nextReviewDate ?? '').localeCompare(b.nextReviewDate ?? '')
    )

  const current = details?.orthodonticCase.id === caseId ? details : null
  const selectedCase = cases.find((item) => item.id === caseId)
  const currentStatus = selectedCase?.status

  return (
    <div className="specialty-page ct-ortho-compact">
      {/* CT_ORTHO_COMPACT_HEADER_20261105 */}
      {/* CT_ORTHO_MINIMAL_HEADER_20261105 */}
      {/* CT_ORTHO_BRAND_TITLE_V1 */}
      <div className="page-heading ct-ortho-compact-heading">
        <div className="ct-ortho-brand-heading">
          <span className="ct-ortho-brand-accent" aria-hidden="true" />
          <div className="ct-ortho-brand-copy">
            <h1>Orthodontics</h1>
            <p>Specialist treatment workspace</p>
          </div>
        </div>
        <div className="ct-ortho-compact-controls">
      <nav className="ct-ortho-hub-tabs" aria-label="Orthodontics sections">
        {(['Dashboard', 'Cases', 'Patients', 'Reports', 'Analysis'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'is-active' : ''}
            aria-current={activeTab === tab ? 'page' : undefined}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'Dashboard' ? 'Overview' : tab}
          </button>
        ))}
      </nav>
          {(activeTab !== 'Dashboard' && activeTab !== 'Cases') && (
            <button type="button" className="secondary-button ct-ortho-secondary-refresh"
              disabled={!patientId || loading}
              onClick={() => { setLoading(true); setReload((v) => v + 1) }}>
              <RefreshCw size={16} /> Refresh
            </button>
          )}
        </div>
      </div>

      {/* CT_ORTHO_DASHBOARD_V2 */}
      {(activeTab !== 'Dashboard' && activeTab !== 'Cases') && (
      <div className="ct-ortho-primary-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setActiveTab('Patients')
            setWorkspaceTab('Clinical')
            setOpenNewCase(true)
          }}
        >
          <Plus size={17} />
          New Case
        </button>
      </div>
      )}

      {error && <div className="specialty-alert specialty-error" role="alert">{error}</div>}
      {success && <div className="specialty-alert specialty-success" role="status">{success}</div>}

      {/* New Orthodontics navigation */}
{/* CT_ORTHO_COMMAND_CENTRE_V1 */}

      {/* CT_ORTHO_CASE_CARDS_V1 */}

      {/* ORTHOHUB_V1 — overview and practice-wide cases */}
      {activeTab === 'Dashboard' && (
        <OrthoHub mode="overview"
          onOpenCase={item => {
            selectPatient(item.patientId)
            setReload(v => v + 1)
            setCaseId(item.id)
            setDetails(null)
            setWorkspaceTab('Clinical')
            setActiveTab('Patients')
          }}
          onFinancials={item => {
            selectPatient(item.patientId)
            setReload(v => v + 1)
            setCaseId(item.id)
            setActiveTab('Reports')
          }}
          onNewCase={() => {
            setActiveTab('Patients')
            setWorkspaceTab('Clinical')
            setOpenNewCase(true)
          }}
          onCases={() => setActiveTab('Cases')}
          onReports={() => setActiveTab('Reports')}
        />
      )}

      {activeTab === 'Cases' && (
        <OrthoHub mode="cases"
          onOpenCase={item => {
            selectPatient(item.patientId)
            setReload(v => v + 1)
            setCaseId(item.id)
            setDetails(null)
            setWorkspaceTab('Clinical')
            setActiveTab('Patients')
          }}
          onFinancials={item => {
            selectPatient(item.patientId)
            setReload(v => v + 1)
            setCaseId(item.id)
            setActiveTab('Reports')
          }}
          onNewCase={() => {
            setActiveTab('Patients')
            setWorkspaceTab('Clinical')
            setOpenNewCase(true)
          }}
          onCases={() => setActiveTab('Cases')}
          onReports={() => setActiveTab('Reports')}
        />
      )}

      {activeTab === 'Reports' && (
        <div className="ct-ortho-hub">
          <section className="ct-ortho-hub-card">
            <h2>Orthodontic Reports & Financials</h2>
            <p>Select a patient and case to view its saved financial records.</p>

            <label htmlFor="ct-ortho-report-patient">Patient</label>
            <select
              id="ct-ortho-report-patient"
              value={patientId}
              onChange={event => selectPatient(event.target.value)}
            >
              <option value="">Select a patient</option>
              {patients.map(patient => (
                <option key={patient.id} value={patient.id}>
                  {patient.name}
                </option>
              ))}
            </select>

            <label htmlFor="ct-ortho-report-case">Orthodontic case</label>
            <select
              id="ct-ortho-report-case"
              value={caseId}
              onChange={event => {
                setCaseId(event.target.value)
                setDetails(null)
              }}
            >
              <option value="">Select a case</option>
              {cases.map(item => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </section>

          {selectedCase ? (
            <OrthodonticFinancials
              key={selectedCase.id}
              caseId={selectedCase.id}
              caseTitle={selectedCase.title}
            />
          ) : (
            <section className="ct-ortho-hub-card">
              Select an orthodontic case to view its financials.
            </section>
          )}
        </div>
      )}

      {activeTab === 'Analysis' && (
        <div className="ct-ortho-hub">
          <section className="ct-ortho-hub-card">
            <h2>Case Analysis</h2>
            <p>Orthodontic case status for the selected patient.</p>

            <div className="ct-ortho-hub-kpis">
              <article>
                <span>Total Cases</span>
                <strong>{cases.length}</strong>
              </article>
              <article>
                <span>Planning</span>
                <strong>{planningCases}</strong>
              </article>
              <article>
                <span>Active</span>
                <strong>{activeCases}</strong>
              </article>
              <article>
                <span>Completed</span>
                <strong>{completedCases}</strong>
              </article>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'Patients' && (
        <>
      
      {/* CT_ORTHO_PATIENT_DIRECTORY_V2 */}
      
      {/* CT_ORTHO_PATIENT_CARDS_V3 */}
      {!patientWorkspaceOpen && (
        <section className="ct-ortho-patients-v3">

          <div className="ct-patients-v3-heading">
            <div>
              <h2>Patients</h2>
              <p>
                Select a patient to access their
                orthodontic treatment records.
              </p>
            </div>
            <span>{patients.length} patients</span>
          </div>

          <div className="ct-patients-v3-search">
            <input
              type="search"
              placeholder="Search patients by name..."
              aria-label="Search patients"
              value={patientSearch}
              onChange={event =>
                setPatientSearch(event.target.value)
              }
            />
          </div>

          <div className="ct-patients-v3-grid">
            {patients
              .filter(patient =>
                patient.name.toLowerCase().includes(
                  patientSearch.trim().toLowerCase()
                )
              )
              .map(patient => (
                <button
                  type="button"
                  className="ct-patient-v3-card"
                  key={patient.id}
                  onClick={() => {
                    selectPatient(patient.id)
                    setWorkspaceTab('Clinical')
                  }}
                >
                  <div className="ct-patient-v3-top">
                    <span className="ct-patient-v3-badge">
                      Patient record
                    </span>
                    <span aria-hidden="true">›</span>
                  </div>

                  <div className="ct-patient-v3-identity">
                    <span className="ct-patient-v3-avatar">
                      {patient.name
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map(part =>
                          part.charAt(0).toUpperCase()
                        )
                        .join('')}
                    </span>

                    <span className="ct-patient-v3-name">
                      <strong>{patient.name}</strong>
                      <small>Registered patient</small>
                    </span>
                  </div>

                  <div className="ct-patient-v3-footer">
                    Open patient record
                    <span aria-hidden="true">→</span>
                  </div>
                </button>
              ))}
          </div>

          {patients.length === 0 && (
            <div className="ct-patient-v3-empty">
              No patients are available in the current
              clinical patient directory.
            </div>
          )}

          {patients.length > 0 &&
            !patients.some(patient =>
              patient.name.toLowerCase().includes(
                patientSearch.trim().toLowerCase()
              )
            ) && (
              <div className="ct-patient-v3-empty">
                No patients match your search.
              </div>
            )}
        </section>
      )}

      {patientWorkspaceOpen && patientId && (
        <>
          <div className="ct-patient-v3-workspace-header">
            <button
              type="button"
              className="ct-patient-v3-back"
              onClick={() => {
                setPatientWorkspaceOpen(false)
                setWorkspaceTab('Clinical')
              }}
            >
              ← Back to Patients
            </button>

            <div>
              <h2>
                {patients.find(
                  patient => patient.id === patientId
                )?.name || 'Patient Workspace'}
              </h2>
              <p>
                Orthodontic treatment and clinical records
              </p>
            </div>
          </div>




      {patientId && (
        <section className="ct-ortho-overview" aria-label="Orthodontic case overview">
          <div className="ct-ortho-kpi">
            <span>Total cases</span>
            <strong>{cases.length}</strong>
            <small>For selected patient</small>
          </div>
          <div className="ct-ortho-kpi">
            <span>Planning</span>
            <strong>{planningCases}</strong>
            <small>Awaiting treatment</small>
          </div>
          <div className="ct-ortho-kpi">
            <span>Active</span>
            <strong>{activeCases}</strong>
            <small>In treatment</small>
          </div>
          <div className="ct-ortho-kpi">
            <span>Completed</span>
            <strong>{completedCases}</strong>
            <small>Finished cases</small>
          </div>
          <div className="ct-ortho-reviews">
            <div className="ct-ortho-reviews-title">
              <strong>Upcoming clinical reviews</strong>
              <span>{upcomingReviews.length} scheduled in case records</span>
            </div>
            {upcomingReviews.length === 0 ? (
              <p>No future review dates recorded for this patient.</p>
            ) : (
              <div className="ct-ortho-review-list">
                {upcomingReviews.slice(0, 4).map(item => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setCaseId(item.id)
                      setDetails(null)
                    }}
                  >
                    <span>{item.title}</span>
                    <strong>{item.nextReviewDate}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      
      {patientId && (
        <ClinicalImagingPanel
          key={`${patientId}:${caseId}`}
          patientId={patientId}
          orthodonticCaseId={caseId || null}
        />
      )}

      {patientId && (
        <div className="ct-ortho-workspace-tabs" role="group"
          aria-label="Orthodontics workspace">
          <button
            type="button"
            className={workspaceTab === 'Clinical' ? 'is-active' : ''}
            aria-pressed={workspaceTab === 'Clinical'}
            onClick={() => setWorkspaceTab('Clinical')}
          >
            Clinical Care
          </button>
          <button
            type="button"
            className={workspaceTab === 'Financials' ? 'is-active' : ''}
            aria-pressed={workspaceTab === 'Financials'}
            onClick={() => setWorkspaceTab('Financials')}
          >
            Financials
          </button>
        </div>
      )}

      {workspaceTab === 'Financials' && patientId && (
        selectedCase ? (
          <OrthodonticFinancials
            key={selectedCase.id}
            caseId={selectedCase.id}
            caseTitle={selectedCase.title}
          />
        ) : (
          <section className="panel">
            <h2>Case Financials</h2>
            <p>
              Select or create an orthodontic case in Clinical Care
              before opening its financial agreement.
            </p>
            <button type="button" className="secondary-button"
              onClick={() => setWorkspaceTab('Clinical')}>
              Open Clinical Care
            </button>
          </section>
        )
      )}

      {workspaceTab === 'Clinical' && patientId && <div className="specialty-columns">
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
          <form id="ct-ortho-new-case" className="specialty-form specialty-divider" onSubmit={(event) => void createCase(event)}>
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
            <OrthodonticCareTimeline
              caseTitle={selectedCase.title}
              status={selectedCase.status}
              createdAtUtc={selectedCase.createdAtUtc}
              nextReviewDate={selectedCase.nextReviewDate}
              progressNotes={current?.progressNotes ?? []}
              loading={current === null}
            />
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
        </>
      )}
        </>
      )}
    </div>
  )
}
