import PatientPrescriptionNotes from './PatientPrescriptionNotes'
import PatientAccountActivityView from './PatientAccountActivityView'
import PatientAccountInvoiceView from './PatientAccountInvoiceView'
import DentalChartingPage from './DentalChartingPage'
import DentistConsultationsPage from './DentistConsultationsPage'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronRight, Mail, Phone, Plus, RefreshCw, Search, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { apiRequest } from '../services/api'
import PatientsPage from './PatientsPage'
import PatientMedicalCards from './PatientMedicalCards'
import './PatientExperiencePage.css'

type Patient = {
  id: string
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  title?: string | null
  dateOfBirth?: string | null
  gender?: string | null
  phoneNumber?: string | null
  email?: string | null
  address?: string | null
  idNumber?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  paymentMethod?: string | null
  medicalAidScheme?: string | null
  medicalAidOption?: string | null
  medicalAidMemberNumber?: string | null
  isArchived?: boolean
}

type Visit = {
  id: string
  patientId: string
  startUtc: string
  endUtc?: string
  status: string
  reason?: string | null
}

type HistoryRecord = {
  allergies?: string | null
  currentMedications?: string | null
  medicalConditions?: string | null
  dentalHistory?: string | null
  additionalNotes?: string | null
}

type PatientTab = 'Overview' | 'Treatment' | 'Medical Records' | 'Accounts' | 'Details' | 'Visit' | 'History'
type Props = {
  role: string
  onClose?: () => void
  onOpenAppointments?: (patientId?: string) => void
  onOpenLaboratory?: (patientId: string) => void
  onOpenCheckout?: (appointmentId?: string) => void
  initialConsultationAppointmentId?: string | null
  onConsultationOpened?: () => void
}
type LabRequirement = { patientId: string; procedureId: string; planId: string; description: string; toothCode: string | null }
const tabs: PatientTab[] = ['Overview', 'Treatment', 'Accounts', 'Details', 'Visit', 'History']

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
function normalizePatient(value: unknown): Patient | null {
  const row = record(value)
  if (!row || typeof row.id !== 'string') return null
  return row as Patient
}
function parsePatients(result: unknown): Patient[] {
  const envelope = record(result)
  const items = Array.isArray(result) ? result :
    envelope?.items ?? envelope?.patients ?? envelope?.results ?? envelope?.data
  if (!Array.isArray(items)) throw new Error('The patient directory response was not recognised.')
  return items.map(normalizePatient).filter((p): p is Patient => p !== null)
}
function parsePatient(result: unknown): Patient | null {
  const wrapper = record(result)
  return normalizePatient(wrapper?.patient ?? wrapper?.data ?? result)
}
function patientName(patient: Patient): string {
  const full = patient.fullName?.trim()
  return full || [patient.title, patient.firstName, patient.lastName]
    .filter(Boolean).join(' ').trim() || 'Unnamed patient'
}
function initials(patient: Patient): string {
  return [patient.firstName, patient.lastName]
    .filter(Boolean).map(s => String(s).charAt(0).toUpperCase()).join('') || 'PT'
}
function age(date?: string | null): string {
  if (!date) return '—'
  const birth = new Date(date)
  if (Number.isNaN(birth.getTime())) return '—'
  const today = new Date()
  let years = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) years -= 1
  return years >= 0 && years < 130 ? `${years} years` : '—'
}
function detailValue(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : 'Not recorded'
}
function formattedDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}
function patientField(label: string, value: unknown) {
  return <div className="ct-patient-field" key={label}>
    <span>{label}</span><strong>{detailValue(value)}</strong>
  </div>
}


/* CT_PATIENT_OVERVIEW_POLISH_V6 */

/**
 * Small read-only calendar for the current patient.
 * Uses the appointments already loaded by PatientExperiencePage.
 */
function MiniVisitCalendar({
  visits,
}: {
  visits: Array<{ startUtc: string }>
}) {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()

  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Monday is the first day of the week.
  const offset = (firstDay.getDay() + 6) % 7

  const appointmentDates = new Set(
    visits
      .filter(visit => !Number.isNaN(
        new Date(visit.startUtc).getTime()
      ))
      .map(visit =>
        new Date(visit.startUtc).toDateString()
      )
  )

  const cells = Array.from(
    { length: offset + daysInMonth },
    (_, index) => {
      const day = index - offset + 1
      return day > 0 ? day : null
    }
  )

  const monthLabel = today.toLocaleDateString(
    'en-ZA',
    { month: 'short', year: 'numeric' }
  )

  return (
    <div
      className="ct-pv6-calendar"
      aria-label={`Patient appointment calendar for ${monthLabel}`}
    >
      <div className="ct-pv6-calendar-heading">
        <span>Calendar</span>
        <strong>{monthLabel}</strong>
      </div>

      <div className="ct-pv6-calendar-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(
          (label, index) => (
            <span
              className="ct-pv6-weekday"
              key={`weekday-${index}`}
            >
              {label}
            </span>
          )
        )}

        {cells.map((day, index) => {
          if (day === null) {
            return (
              <span
                className="ct-pv6-empty"
                key={`blank-${index}`}
                aria-hidden="true"
              />
            )
          }

          const date = new Date(year, month, day)

          const isToday =
            date.toDateString() === today.toDateString()

          const hasAppointment =
            appointmentDates.has(date.toDateString())

          return (
            <span
              key={`day-${day}`}
              className={[
                'ct-pv6-day',
                isToday ? 'ct-pv6-today' : '',
                hasAppointment ? 'ct-pv6-booked' : '',
              ].filter(Boolean).join(' ')}
              title={
                hasAppointment
                  ? `Appointment on ${date.toLocaleDateString('en-ZA')}`
                  : date.toLocaleDateString('en-ZA')
              }
              aria-label={
                `${date.toLocaleDateString('en-ZA')}` +
                (hasAppointment ? ', appointment recorded' : '') +
                (isToday ? ', today' : '')
              }
            >
              {day}
              {hasAppointment && (
                <span
                  className="ct-pv6-dot"
                  aria-hidden="true"
                />
              )}
            </span>
          )
        })}
      </div>

      <div className="ct-pv6-calendar-legend">
        <span className="ct-pv6-legend-dot" />
        Appointment
      </div>
    </div>
  )
}

export default function PatientExperiencePage({ role, onClose, onOpenAppointments, onOpenLaboratory, onOpenCheckout, initialConsultationAppointmentId, onConsultationOpened }: Props) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Patient | null>(null)
  const [tab, setTab] = useState<PatientTab>('Overview')
  const [consultationAppointmentId, setConsultationAppointmentId] = useState<string | null>(null)
  const [treatmentSection, setTreatmentSection] = useState<'Consultation' | 'Dental Chart' | 'Treatment Plan' | 'Clinical Notes & Encounters' | 'Medical Records' | 'Clinical Images' | 'Tooth History' | 'Prescriptions' | null>(null)
  // CT_PATIENT_ACCOUNTS_V1
  const [accountSection, setAccountSection] = useState<string | null>(null)

  const [accountsMenuOpen, setAccountsMenuOpen] = useState(false)

  // CT_ACCOUNTS_THEME_COMPACT_V8
  // Match the actual rendered Accounts tab, including gradient themes.
  useEffect(() => {
    if (tab !== 'Accounts') return

    const syncAccountTheme = () => {
      const activeTab = document.querySelector<HTMLElement>(
        '.ct-patient-tabs [role="tab"][aria-selected="true"]'
      )
      const workspace = document.querySelector<HTMLElement>(
        '.ct-pa-v4-workspace'
      )

      if (!activeTab || !workspace) return

      const style = window.getComputedStyle(activeTab)
      const background = style.backgroundImage !== 'none'
        ? style.backgroundImage
        : style.backgroundColor

      if (!background || background === 'transparent' ||
          background === 'rgba(0, 0, 0, 0)') return

      const colour = background.match(
        /#[0-9a-f]{3,8}\b|rgba?\([^)]+\)/i
      )

      const accent = colour?.[0] ?? style.borderTopColor

      workspace.style.setProperty(
        '--ct-account-tab-background',
        background
      )
      workspace.style.setProperty(
        '--ct-account-tab-accent',
        accent
      )
      workspace.style.setProperty(
        '--ct-account-tab-foreground',
        style.color
      )
    }

    syncAccountTheme()

    // Re-sync when Settings changes the active theme,
    // without observing our own Account styling updates.
    const observer = new MutationObserver(mutations => {
      const externalChange = mutations.some(mutation => {
        const target = mutation.target
        return !(target instanceof Element &&
          target.closest('.ct-pa-v4-workspace'))
      })

      if (externalChange) syncAccountTheme()
    })

    observer.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: [
        'class', 'style', 'data-theme',
        'data-accent', 'aria-selected'
      ]
    })

    return () => observer.disconnect()
  }, [tab])


  // Close the dropdown when leaving the Accounts tab.
  useEffect(() => {
    setAccountsMenuOpen(false)
  }, [tab])


  // CT_PATIENT_ACCOUNTS_LAYOUT_V4_RESET
  useEffect(() => {
    if (tab !== 'Accounts') {
      setAccountSection(null)
    }
  }, [tab])


  const [quickRegister, setQuickRegister] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [reload, setReload] = useState(0)
  const [visits, setVisits] = useState<Visit[]>([])
  const [visitsLoading, setVisitsLoading] = useState(false)
  const [medical, setMedical] = useState<HistoryRecord | null>(null)
  const [medicalLoading, setMedicalLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionNotice, setActionNotice] = useState('')
  const [labNeeds, setLabNeeds] = useState<LabRequirement[]>([])
  const [stepBusy, setStepBusy] = useState(false)

  const canManage = role === 'Receptionist' || role === 'PracticeAdmin' || role === 'Dentist'
  const isDentist = role === 'Dentist'

  useEffect(() => {
    let cancelled = false
    apiRequest<unknown>('/patients')
      .then(parsePatients)
      .then(items => { if (!cancelled) { setPatients(items); setError('') } })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load patients.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reload])

  // Resolve queue actions through the dentist-only consultation API.
  useEffect(() => {
    if (!initialConsultationAppointmentId || !isDentist || loading) return
    let cancelled = false
    const appointmentId = initialConsultationAppointmentId
    apiRequest<{ patientId: string }>(`/dentist/consultations/by-appointment/${encodeURIComponent(appointmentId)}`)
      .then(async result => {
        if (!result.patientId) throw new Error('The consultation has no linked patient.')
        const existing = patients.find(patient => patient.id === result.patientId)
        if (existing) return existing
        return parsePatient(await apiRequest<unknown>(`/patients/${encodeURIComponent(result.patientId)}`))
      })
      .then(patient => {
        if (cancelled) return
        if (!patient) throw new Error('The patient record could not be opened.')
        setSelected(patient)
        // Let the clinician choose Consultation from the compact treatment menu.
        setTreatmentSection(null)
        setTab('Treatment')
        setConsultationAppointmentId(appointmentId)
            setDetailError('')
        setActionNotice('')
        setVisits([])
        setVisitsLoading(true)
        setDetailLoading(true)
        setMedical(null)
        onConsultationOpened?.()
      })
      .catch(cause => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Unable to open the consultation under Patients.')
        onConsultationOpened?.()
      })
    return () => { cancelled = true }
  }, [initialConsultationAppointmentId, isDentist, loading, patients, onConsultationOpened])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    apiRequest<unknown>(`/patients/${encodeURIComponent(selected.id)}`)
      .then(parsePatient)
      .then(item => { if (!cancelled && item) { setSelected(item); setDetailError('') } })
      .catch(cause => { if (!cancelled) setDetailError(cause instanceof Error ? cause.message : 'Could not refresh this record.') })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selected?.id])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    const now = Date.now()
    const fromPast = new Date(now - 89 * 86400000).toISOString()
    const nearFuture = new Date(now + 2 * 86400000).toISOString()
    const fromFuture = new Date(now).toISOString()
    const toFuture = new Date(now + 60 * 86400000).toISOString()
    const url = (from: string, to: string) =>
      `/appointments?fromUtc=${encodeURIComponent(from)}&toUtc=${encodeURIComponent(to)}`
    Promise.all([
      apiRequest<unknown>(url(fromPast, nearFuture)),
      apiRequest<unknown>(url(fromFuture, toFuture)),
    ]).then(results => {
      if (cancelled) return
      const byId = new Map<string, Visit>()
      for (const result of results) {
        if (!Array.isArray(result)) continue
        for (const value of result) {
          const entry = record(value)
          if (entry && typeof entry.id === 'string' &&
              typeof entry.patientId === 'string' && typeof entry.startUtc === 'string' &&
              typeof entry.status === 'string' && entry.patientId === selected.id) {
            byId.set(entry.id, value as Visit)
          }
        }
      }
      const linkedVisits = Array.from(byId.values()).sort((a,b) => b.startUtc.localeCompare(a.startUtc))
      setVisits(linkedVisits)
      const currentClinicalVisit = linkedVisits.find(visit => visit.status === 'InConsultation')
      // Keep the active visit ready for the Treatment > Consultation step,
      // but never change tabs automatically after registration or opening a record.
      if (isDentist && currentClinicalVisit) {
        setConsultationAppointmentId(previous => previous ?? currentClinicalVisit.id)
      }
    }).catch(() => { if (!cancelled) setVisits([]) })
      .finally(() => { if (!cancelled) setVisitsLoading(false) })
    return () => { cancelled = true }
  }, [selected?.id, reload])

  useEffect(() => {
    if (!selected || !isDentist || tab !== 'Medical Records') return
    let cancelled = false
    apiRequest<unknown>(`/dentist/patients/${encodeURIComponent(selected.id)}/medical-history`)
      .then(value => { if (!cancelled) setMedical(record(value) as HistoryRecord | null) })
      .catch(() => { if (!cancelled) setMedical(null) })
      .finally(() => { if (!cancelled) setMedicalLoading(false) })
    return () => { cancelled = true }
  }, [selected?.id, isDentist, tab])

  const saDate = (date: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date)
  const appointmentToCheckIn = canManage ? visits.find(visit =>
    visit.status === 'Scheduled' &&
    saDate(new Date(visit.startUtc)) === saDate(new Date())) : undefined

  async function checkInPatient() {
    if (!appointmentToCheckIn) return
    setActionBusy(true)
    setActionNotice('')
    try {
      await apiRequest(`/appointments/${encodeURIComponent(appointmentToCheckIn.id)}/check-in`, 'POST')
      setActionNotice('Patient checked in successfully. The Dentist queue has been updated.')
      setVisitsLoading(true)
      setReload(count => count + 1)
    } catch (cause) {
      setActionNotice(cause instanceof Error ? cause.message : 'Check-in failed.')
    } finally {
      setActionBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const input = query.trim().toLowerCase()
    if (!input) return patients
    return patients.filter(patient =>
      [patientName(patient), patient.phoneNumber, patient.idNumber, patient.email]
        .some(value => typeof value === 'string' && value.toLowerCase().includes(input)))
  }, [patients, query])

  function openPatient(patient: Patient) {
    setAccountSection(null)
    setSelected(patient)
    setTab('Overview')
    setTreatmentSection(null)
    setLabNeeds([])
    setConsultationAppointmentId(null)
    setDetailError('')
    setActionNotice('')
    setDetailLoading(true)
    setVisitsLoading(true)
    setMedicalLoading(true)
    setMedical(null)
    setVisits([])
  }

  const activeClinicalVisit = visits.find(visit => visit.status === 'InConsultation')
  const checkoutVisit = visits.find(visit => visit.status === 'AwaitingCheckout')

  // The next clinical step is resolved from saved appointment and lab data,
  // never from a fictitious visit or manually entered balance.
  async function advanceTreatment() {
    if (!selected || stepBusy) return
    if (treatmentSection === 'Consultation') { setTreatmentSection('Dental Chart'); return }
    if (treatmentSection === 'Dental Chart') { setTreatmentSection('Treatment Plan'); return }
    if (treatmentSection === 'Prescriptions') { setTab('Visit'); return }
    if (treatmentSection !== 'Treatment Plan') { setTreatmentSection('Consultation'); return }

    setStepBusy(true)
    setActionNotice('')
    try {
      const required = await apiRequest<LabRequirement[]>('/laboratory/lab-required')
      const thisPatient = required.filter(item => item.patientId === selected.id)
      setLabNeeds(thisPatient)
      if (thisPatient.length && onOpenLaboratory) {
        onOpenLaboratory(selected.id)
        return
      }
      if (activeClinicalVisit) {
        setConsultationAppointmentId(activeClinicalVisit.id)
        setTreatmentSection('Consultation')
        return
      }
      if (checkoutVisit) {
        setActionNotice('This consultation is already finalized. Reception can collect the verified balance in Checkout; do not bill a treatment plan a second time.')
        setTab('Visit')
        return
      }
      setActionNotice('A treatment plan alone is not a bill. Book the patient, check in on the visit day, and finalize the actual consultation before checkout.')
      onOpenAppointments?.(selected.id)
    } catch (cause) {
      setActionNotice(cause instanceof Error
        ? 'Unable to verify the next treatment step: ' + cause.message
        : 'Unable to verify the next treatment step. Please retry.')
    } finally {
      setStepBusy(false)
    }
  }

  useEffect(() => {
    if (!isDentist || !selected?.id || tab !== 'Treatment' || treatmentSection !== 'Treatment Plan') return
    let active = true
    apiRequest<LabRequirement[]>('/laboratory/lab-required')
      .then(rows => { if (active) setLabNeeds(rows.filter(item => item.patientId === selected.id)) })
      .catch(() => { if (active) setLabNeeds([]) })
    return () => { active = false }
  }, [isDentist, selected?.id, tab, treatmentSection])

  function backToCards() {
    setSelected(null)
    setLoading(true)
    setReload(value => value + 1)
  }


  // CT_DIRECT_QUICK_REGISTRATION_V1
  if (quickRegister && canManage) {
    return (
      <PatientsPage
        autoOpenRegistration
        onRegistrationExit={() => {
          setQuickRegister(false)
          setLoading(true)
          setReload(value => value + 1)
        }}
        onExistingPatientSelect={(patientId) => {
          setQuickRegister(false)
          // A new registration was not in the previous patient-search results.
          // Read the canonical record from the API before opening the workflow.
          void apiRequest<unknown>(`/patients/${encodeURIComponent(patientId)}`)
            .then(parsePatient)
            .then(patient => {
              if (!patient) throw new Error('Patient registration saved but record could not be loaded.')
              openPatient(patient)
              setActionNotice('Patient registered successfully. Review the patient record or book an appointment when needed.')
              setReload(value => value + 1)
            })
            .catch(cause => {
              setError(cause instanceof Error ? cause.message : 'Unable to open the new patient.')
              setLoading(true)
              setReload(value => value + 1)
            })
        }}
      />
    )
  }

  if (!selected) {
    return (
      <div className="ct-dir4-overlay">
        <section
          className="ct-patients-experience ct-dir4-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Patients"
        >
          {/* CT_PATIENT_DIRECTORY_V4 */}
          <button
            type="button"
            className="ct-dir4-close"
            aria-label="Close Patients"
            onClick={() => onClose?.()}
          >
            ×
          </button>

      <div className="ct-patient-toolbar">
        <div><p className="ct-patient-eyebrow">PATIENT DIRECTORY</p><h1>Patients</h1><p>Open a patient card to view their full practice record.</p></div>
        <div className="ct-patient-directory-actions">
          {canManage && <button type="button" className="primary-button ct-patient-register-action" onClick={() => setQuickRegister(true)}><UserPlus size={17}/> Register Patient</button>}
        </div>
      </div>
      <div className="ct-patient-searchrow">
        <label className="ct-patient-search"><Search size={19}/><input aria-label="Search patients" value={query} placeholder="Search by name, phone or patient ID" onChange={event => setQuery(event.target.value)}/></label>
        <button type="button" className="secondary-button" onClick={() => { setLoading(true); setReload(value => value + 1) }} disabled={loading}><RefreshCw size={16}/> Refresh</button>
      </div>
      {error && <p className="ct-patient-message ct-patient-error" role="alert">{error}</p>}
      {loading ? <div className="ct-patient-message">Loading registered patients…</div> : filtered.length === 0 ?
        <div className="ct-patient-message"><Users size={25}/><h2>No matching patients</h2><p>{query ? 'Try a different search.' : 'There are no patients in the current directory response.'}</p></div> :
        <div className="ct-patient-grid">
          {filtered.map(patient => <button type="button" key={patient.id} className="ct-patient-card" onClick={() => openPatient(patient)}>
            <div className="ct-patient-card-top"><span className={patient.isArchived ? 'ct-patient-status ct-archived' : 'ct-patient-status'}>{patient.isArchived ? 'Archived' : 'Active'}</span><ChevronRight size={18}/></div>
            <div className="ct-patient-card-title"><div className="ct-patient-avatar">{initials(patient)}</div><div><strong>{patientName(patient)}</strong><small>Patient record</small></div></div>
            <div className="ct-patient-tags"><span>{age(patient.dateOfBirth)}</span><span>{detailValue(patient.gender)}</span><span>{detailValue(patient.paymentMethod)}</span></div>
            <p className="ct-patient-contact"><Phone size={14}/>{detailValue(patient.phoneNumber)}</p>
            <span className="ct-patient-open">Open patient record <ArrowRight size={15}/></span>
          </button>)}
        </div>}
      <p className="ct-patient-limit-note">Showing {filtered.length} of {patients.length} patient records returned by this request.</p>
    </section>
      </div>
    )
  }

  return <div
    className="ct-pv5-overlay"
    onMouseDown={event => {
      if (event.target === event.currentTarget) backToCards()
    }}
  >
    <section
      className="ct-patients-experience ct-pv5-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Patient record"
    >
    {/* CT_PATIENT_HEADER_V8 */}
    <header className="ct-patient-detail-header ct-pv8-header">
      <button
        type="button"
        className="secondary-button ct-pv8-back"
        onClick={backToCards}
      >
        <ArrowLeft size={14}/>
        Patients
      </button>

      <div className="ct-patient-avatar ct-patient-avatar-large ct-pv8-avatar">
        {initials(selected)}
      </div>

      <div className="ct-pv8-identity">
        <div className="ct-pv8-name-row">
          <h1>{patientName(selected)}</h1>
          <span
            className={
              selected.isArchived
                ? 'ct-patient-status ct-archived'
                : 'ct-patient-status'
            }
          >
            {selected.isArchived ? 'Archived' : 'Active'}
          </span>
        </div>

        <div className="ct-pv8-meta">
          <span title={selected.id}>
            <strong>Patient ID:</strong> {selected.id.slice(0, 8)}
          </span>

          <span>
            <strong>DOB:</strong> {formattedDate(selected.dateOfBirth)}
            {' '}({age(selected.dateOfBirth)})
          </span>

          <span>
            <strong>Gender:</strong> {detailValue(selected.gender)}
          </span>
        </div>
      </div>

      <div className="ct-pv8-contact">
        <span>
          <Phone size={13}/>
          {detailValue(selected.phoneNumber)}
        </span>
        <span>
          <Mail size={13}/>
          {detailValue(selected.email)}
        </span>
      </div>

      <div className="ct-pv8-payment">
        {selected.paymentMethod === 'MedicalAid'
          ? 'Medical Aid'
          : selected.paymentMethod === 'Cash'
            ? 'Private / Cash'
            : detailValue(selected.paymentMethod)}
      </div>

    </header>

    {detailError && <p className="ct-patient-message ct-patient-error" role="alert">{detailError}</p>}
    {actionNotice && <p className="ct-patient-message" role="status">{actionNotice}</p>}
    {detailLoading && <p className="ct-patient-loading">Refreshing patient details…</p>}
    <div className="ct-patient-tabs" role="tablist" aria-label="Patient record sections">
      {tabs.filter(item => item !== 'Treatment' || isDentist).map(item => <button type="button" key={item} role="tab" aria-selected={item === tab} className={tab === item ? 'ct-patient-tab selected' : 'ct-patient-tab'} onClick={() => { if (item === 'Treatment') setTreatmentSection(null); setTab(item) }}>{item}</button>)}
    </div>


    {/* CT_PATIENT_OVERVIEW_V5 */}

    {/* CT_PATIENT_TREATMENT_INTEGRATION_V1 */}
    {tab === 'Treatment' && (
      <section className="ct-patient-treatment">
        {/* CT_TREATMENT_ROLE_FIX_V2 */}
        {!isDentist ? (
          <div className="ct-pt-role-message" role="status">
            <strong>Treatment workspace</strong>
            <p>
              Clinical treatment and medical records are available
              to authorised dentists.
            </p>
            <p>
              Reception can manage patient registration,
              appointments and administrative details.
            </p>
          </div>
        ) : !treatmentSection ? (
          /* CT_FLOATING_TREATMENT_CHOOSER_V6 */
          <div className="ct-pt-chooser-backdrop">
            <div
              className="ct-pt-chooser-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ct-pt-chooser-title"
            >
              
              <button
                type="button"
                className="ct-pt-chooser-close"
                aria-label="Back to patient overview"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setTreatmentSection(null)
                  setTab('Overview')
                }}
              >
                ×
              </button>

            
              {/* CT_TREATMENT_CHOOSER_ACTIONS_V7 */}
              <div className="ct-pt-chooser-top-actions">
                <button
                  type="button"
                  className="ct-pt-chooser-back-button"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setTreatmentSection(null)
                    setTab('Overview')
                  }}
                >
                  ← Back to Patient
                </button>
              </div>
<div className="ct-pt-heading">
              <h2 id="ct-pt-chooser-title">Treatment</h2>
              <p>Choose a treatment section. Consultation is the first step for new visits.</p>
            </div>
            <div className="ct-pt-menu">
              {([
                ['Consultation', 'Start or continue the patient consultation'],
                ['Dental Chart', 'Select a tooth and view its findings'],
                ['Medical Records', 'Clinical history and allergies'],
                ['Treatment Plan', 'Plan patient procedures'],
                ['Clinical Notes & Encounters', 'Treatment notes and encounters'],
                ['Clinical Images', 'Patient clinical images'],
                ['Prescriptions', 'Review consultation prescription notes'],
              ] as const).map(([name, description]) => (
                <button
                  key={name}
                  type="button"
                  className="ct-pt-option"
                  onClick={() => {
                    setTreatmentSection(name)
                  }}
                >
                  <strong>{name}</strong>
                  <span>{description}</span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>

              <div className="ct-pt-chooser-footer">
                <button
                  type="button"
                  className="ct-pt-cancel-button"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setTreatmentSection(null)
                    backToCards()
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {treatmentSection === 'Treatment Plan' && labNeeds.length > 0 && (
              <div className="ct-treatment-lab-note" role="status">
                <strong>{labNeeds.length} lab-required procedure(s)</strong> on this acknowledged patient plan.
                The dentist must prescribe real lab work before technicians receive a job.
              </div>
            )}
            <div className="ct-treatment-progress-actions">
              <button type="button" className="secondary-button ct-pt-back"
                onClick={() => setTreatmentSection(null)}>Treatment sections</button>
              <button type="button" className="primary-button" disabled={stepBusy}
                onClick={() => void advanceTreatment()}>
                {stepBusy ? 'Checking next step…'
                  : treatmentSection === 'Consultation' ? 'Next: Dental Chart'
                  : treatmentSection === 'Dental Chart' ? 'Next: Treatment Plan'
                  : treatmentSection === 'Treatment Plan' && labNeeds.length > 0 ? 'Next: Laboratory'
                  : treatmentSection === 'Treatment Plan' && activeClinicalVisit ? 'Next: Finalize Consultation'
                  : treatmentSection === 'Treatment Plan' && checkoutVisit ? 'Next: Checkout Status'
                  : treatmentSection === 'Treatment Plan' ? 'Next: Book Visit'
                  : treatmentSection === 'Prescriptions' ? 'Next: Visit & Checkout Status'
                  : 'Next: Consultation'} <ArrowRight size={15}/>
              </button>
            </div>
            {/* CT_TREATMENT_BREADCRUMB_V5 */}
            <nav
              className="ct-pt-breadcrumb"
              aria-label="Clinical workspace location"
            >
              <span>Patients</span>
              <span aria-hidden="true">/</span>
              <span>Treatment</span>
              <span aria-hidden="true">/</span>
              <strong>{treatmentSection}</strong>
            </nav>

            {/* Consultation is always the first clinical section, within Treatment. */}
            {treatmentSection === 'Consultation' ? (
              <div className="ct-patient-consultations">
        <DentistConsultationsPage
          key={selected.id}
          patientId={selected.id}
          selectedAppointmentId={consultationAppointmentId}
          onSelectAppointment={setConsultationAppointmentId}
          onOpenMedicalHistory={() => setTreatmentSection('Medical Records')}
          onFinalized={() => {
            setActionNotice('Consultation finalized. Checkout is now available to authorised reception or management.')
            setTreatmentSection('Prescriptions')
            setReload(count => count + 1)
          }}
        />
              </div>
            ) : treatmentSection === 'Prescriptions' ? (
              <PatientPrescriptionNotes patientId={selected.id} />
            ) : (
              <DentalChartingPage
                key={`${selected.id}-${treatmentSection}`}
                initialPatientId={selected.id}
                initialClinicalTab={treatmentSection}
                onOpenLaboratory={onOpenLaboratory}
              />
            )}
          </>
        )}
      </section>
    )}

    {tab === 'Overview' && (
      <div className="ct-pv5-overview">
        <div className="ct-pv5-title">
          <strong>Patient overview</strong>
          <small>Current visit and next actions</small>
        </div>

        <div className="ct-pv5-grid">
          <section className="ct-pv5-section">
            <h3>Current visit</h3>
            <MiniVisitCalendar visits={visits} />

            {visitsLoading ? (
              <p>Loading appointments…</p>
            ) : visits.some(visit =>
              new Date(visit.startUtc).toDateString() ===
              new Date().toDateString()
            ) ? (
              visits.filter(visit =>
                new Date(visit.startUtc).toDateString() ===
                new Date().toDateString()
              ).map(visit => (
                <div className="ct-pv5-row" key={visit.id}>
                  <span>
                    {new Date(visit.startUtc).toLocaleTimeString(
                      'en-ZA',
                      {hour:'2-digit', minute:'2-digit'}
                    )}
                  </span>
                  <strong>{visit.status}</strong>
                </div>
              ))
            ) : (
              <p>No appointment recorded for today.</p>
            )}

            {appointmentToCheckIn && (
              <button
                type="button"
                className="primary-button"
                disabled={actionBusy}
                onClick={() => void checkInPatient()}
              >
                {actionBusy ? 'Checking in…' : 'Check in'}
              </button>
            )}

            {onOpenAppointments && (
              <button
                type="button"
                className="ct-pv5-link"
                onClick={() => onOpenAppointments?.(selected.id)}
              >
                Open appointments
              </button>
            )}
          </section>

          <section className="ct-pv5-section">
            <h3>Next action</h3>

            <p>
              {appointmentToCheckIn
                ? 'Patient expected today — check in on arrival.'
                : 'Review the appointment schedule or visit status.'}
            </p>

            <div className="ct-pv5-actions">
              <button
                type="button"
                onClick={() => setTab('Visit')}
              >
                View visits
              </button>

              {isDentist && (
                <button
                  type="button"
                  onClick={() => { setTreatmentSection(null); setTab('Treatment') }}
                >
                  Start treatment
                </button>
              )}
            </div>
          </section>

          <section className="ct-pv5-section">
            <h3>Recent visits</h3>

            {visitsLoading ? (
              <p>Loading…</p>
            ) : visits.length === 0 ? (
              <p>No visit history available.</p>
            ) : (
              visits.slice(0, 3).map(visit => (
                <div className="ct-pv5-row" key={visit.id}>
                  <span>{formattedDate(visit.startUtc)}</span>
                  <strong>{visit.status}</strong>
                </div>
              ))
            )}

            <button
              type="button"
              className="ct-pv5-link"
              onClick={() => setTab('History')}
            >
              View history
            </button>
          </section>

          <section className="ct-pv5-section">
            <h3>Contact</h3>

            <p>
              <Phone size={14}/>
              {detailValue(selected.phoneNumber)}
            </p>

            <p>
              <Mail size={14}/>
              {detailValue(selected.email)}
            </p>

            <button
              type="button"
              className="ct-pv5-link"
              onClick={() => setTab('Details')}
            >
              Patient details
            </button>
          </section>
        </div>
      </div>
    )}


    {/* CT_PATIENT_ACCOUNTS_LAYOUT_V4 */}
    {tab === 'Accounts' && (
      <section className="ct-pa-workspace ct-pa-v4-workspace">

        <div className="ct-pa-v4-header">
          <div>
            <h2>Patient Accounts</h2>
            <p>
              Invoices, receipts and financial activity for
              {' '}{patientName(selected)}
            </p>
          </div>
        </div>

        
        {/* CT_PATIENT_ACCOUNTS_EXPANDABLE_V6 */}
        <div className="ct-pa-v6-toolbar">
          <div className="ct-pa-v6-dropdown">
            <button
              type="button"
              className="ct-pa-v6-trigger"
              aria-expanded={accountsMenuOpen}
              aria-controls="ct-pa-v6-menu"
              onClick={() => setAccountsMenuOpen(open => !open)}
            >
              <span aria-hidden="true">▦</span>
              <span>All Accounts</span>
              <span className="ct-pa-v6-chevron" aria-hidden="true">
                {accountsMenuOpen ? '▴' : '▾'}
              </span>
            </button>

            {accountsMenuOpen && (
              <nav
                id="ct-pa-v6-menu"
                className="ct-pa-v6-menu"
                aria-label="Choose patient account section"
              >
                <div className="ct-pa-v6-menu-heading">
                  Account sections
                </div>

                {[
                  'Transactions',
                  'Invoices',
                  'Payments',
                  'Refunds',
                  'Statement'
                ].map(name => {
                  const current =
                    (accountSection === null ||
                     accountSection === 'Overview'
                      ? 'Transactions'
                      : accountSection) === name

                  return (
                    <button
                      key={name}
                      type="button"
                      className={
                        'ct-pa-v6-menu-item' +
                        (current ? ' active' : '')
                      }
                      aria-current={current ? 'page' : undefined}
                      onClick={() => {
                        setAccountSection(
                          name === 'Transactions' ? null : name
                        )
                        setAccountsMenuOpen(false)
                      }}
                    >
                      <span>
                        {name === 'Transactions'
                          ? 'All Transactions'
                          : name}
                      </span>
                      {current && (
                        <span
                          className="ct-pa-v6-check"
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                      )}
                    </button>
                  )
                })}
              </nav>
            )}
          </div>

          <span className="ct-pa-v6-current">
            {accountSection === null ||
             accountSection === 'Transactions' ||
             accountSection === 'Overview'
              ? 'All Transactions'
              : accountSection}
          </span>
        </div>


        <div className="ct-pa-v4-content">

          {(accountSection === null ||
            accountSection === 'Transactions' ||
            accountSection === 'Overview') && (
            <PatientAccountActivityView
              key={`${selected.id}-Transactions`}
              patientId={selected.id}
              role={role}
              section="Transactions"
            />
          )}

          {accountSection === 'Invoices' && (
            <PatientAccountInvoiceView
              key={`${selected.id}-Invoices`}
              patientId={selected.id}
              role={role}
              section="Invoices"
            />
          )}

          {accountSection === 'Payments' && (
            <PatientAccountActivityView
              key={`${selected.id}-Payments`}
              patientId={selected.id}
              role={role}
              section="Payments"
            />
          )}

          {accountSection === 'Refunds' && (
            <div className="ct-pa-v4-pending" role="status">
              Refund records and refund processing are not yet
              connected to an authorised refund workflow.
              No refund can be created from this screen.
            </div>
          )}

          {accountSection === 'Statement' && (
            <div className="ct-pa-v4-pending" role="status">
              The patient statement will become available after
              receipts, allocations, reversals and refunds
              are fully reconciled.
            </div>
          )}

        </div>
      </section>
    )}

    {tab === 'Details' && <section className="ct-patient-panel"><h2>Patient details</h2><div className="ct-patient-field-list ct-patient-two-cols">
      {patientField('Name', patientName(selected))}
      {patientField('Date of birth', formattedDate(selected.dateOfBirth))}
      {patientField('Gender', selected.gender)}
      {patientField('ID number', selected.idNumber)}
      {patientField('Phone', selected.phoneNumber)}
      {patientField('Email', selected.email)}
      {patientField('Address', selected.address)}
      {patientField('Emergency contact', selected.emergencyContactName)}
      {patientField('Emergency phone', selected.emergencyContactPhone)}
      {patientField('Payment method', selected.paymentMethod)}
      {patientField('Medical aid', selected.medicalAidScheme)}
      {patientField('Medical aid option', selected.medicalAidOption)}
      {patientField('Member number', selected.medicalAidMemberNumber)}
    </div></section>}

    {tab === 'Visit' && <section className="ct-patient-panel">
      {checkoutVisit && (
        <div className="ct-patient-checkout-handoff" role="status">
          <strong>Ready for reception checkout</strong>
          <p>This patient has a finalized consultation. Collect verified payment against that specific appointment, not against an unscheduled treatment plan.</p>
          {role !== 'Dentist' && onOpenCheckout &&
            <button type="button" className="primary-button" onClick={() => onOpenCheckout(checkoutVisit.id)}>
              Open Patient Checkout <ArrowRight size={15}/>
            </button>}
          {role === 'Dentist' && <small>Reception or Practice Admin will complete payment and issue the receipt.</small>}
        </div>
      )}
      <div className="ct-patient-tab-heading"><div><h2>Appointments & visits</h2><p>Recent and upcoming bookings for this patient</p></div>{onOpenAppointments && <button type="button" className="primary-button" onClick={() => onOpenAppointments(selected.id)}><Plus size={16}/> Schedule visit</button>}</div>
      {visitsLoading ? <p>Loading appointments…</p> : visits.length === 0 ? <p>No appointments found within the available date range.</p> : visits.map(visit => <div className="ct-patient-visit" key={visit.id}><div><strong>{formattedDate(visit.startUtc)} · {new Date(visit.startUtc).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'})}</strong><p>{visit.reason || 'Dental appointment'}</p></div><span>{visit.status}</span></div>)}
      <p className="ct-patient-limit-note">Visit results cover approximately the past 90 days and next 60 days, subject to API limits.</p>
    </section>}

    {tab === 'Medical Records' && (
      !isDentist ? <section className="ct-patient-panel ct-patient-protected">
        <ShieldCheck size={22}/><strong>Clinical records are restricted</strong>
      </section> :
      <PatientMedicalCards
        key={selected.id}
        patientId={selected.id}
        history={medical}
        loading={medicalLoading}
        onSaved={setMedical}
      />
    )}

    {tab === 'History' && <section className="ct-patient-panel"><h2>Patient visit history</h2>
      <p className="ct-patient-subtext">Visits remain stored in PostgreSQL; this screen displays the appointments in the available date window.</p>
      {visitsLoading ? <p>Loading history…</p> : visits.length === 0 ? <p>No visits found in this date range.</p> : visits.map(visit => <div className="ct-patient-visit" key={visit.id}><div><strong>{formattedDate(visit.startUtc)}</strong><p>{visit.reason || 'Dental appointment'}</p></div><span>{visit.status}</span></div>)}
    </section>}
    </section>
  </div>
}
