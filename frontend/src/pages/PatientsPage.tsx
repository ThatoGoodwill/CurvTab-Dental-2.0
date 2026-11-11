import { getVerifiedPostalCode } from './RegistrationPostalCodes'
import './PatientsPage.css'
import { getLocality, getSuburbs, getCities } from './RegistrationLocality'
import RegistrationOtherPicker from './RegistrationOtherPicker'
import {
  initialRegistrationExtras, RegistrationMedicalScreen,
  RegistrationResponsibleScreen, RegistrationDeclarationScreen,
  RegistrationExtrasReview,
} from './RegistrationExtras'
import type { RegistrationExtrasState } from './RegistrationExtras'

import { useEffect, useState } from 'react'
import type {
  CSSProperties,
  FormEvent,
} from 'react'

import {
  Users,
  UserPlus,
  Search,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  Phone,
  Mail,
  MapPin,
} from 'lucide-react'

import { useAuth } from '../auth/AuthContext'
import {
  apiRequest,
  ApiError,
} from '../services/api'

// =============================================
// PATIENT DATA
//
// The server controls the practice ID.
// Never allow a user to choose another practice
// when registering a patient.
// =============================================

interface Patient {
  id: string
  firstName: string
  lastName: string
  fullName: string
  dateOfBirth: string | null
  phoneNumber: string
  email: string
  address: string
  patientNumber: string
}

interface PatientForm {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  emergencyContactName: string
  emergencyContactPhone: string
  paymentMethod: 'Cash' | 'MedicalAid'
  medicalAidScheme: string
  medicalAidOption: string
  medicalAidMemberNumber: string
  consentGiven: boolean
  phoneNumber: string
  email: string
  address: string
}

const emptyForm: PatientForm = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  paymentMethod: 'Cash',
  medicalAidScheme: '',
  medicalAidOption: '',
  medicalAidMemberNumber: '',
  consentGiven: false,
  phoneNumber: '',
  email: '',
  address: '',
}

// =============================================
// API RESPONSE HELPERS
// =============================================

function asRecord(
  value: unknown
): Record<string, unknown> | null {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return null
  }

  return value as Record<string, unknown>
}

function textField(
  item: Record<string, unknown>,
  ...names: string[]
): string {
  for (const name of names) {
    if (typeof item[name] === 'string') {
      return item[name] as string
    }
  }

  return ''
}

function parsePatient(value: unknown): Patient {
  const row = asRecord(value)

  if (!row) {
    throw new Error('Invalid patient record from the API.')
  }

  const id = textField(row, 'id', 'patientId')

  if (!id) {
    throw new Error('Patient record is missing its ID.')
  }

  const firstName = textField(row, 'firstName', 'givenName')
  const lastName = textField(row, 'lastName', 'surname')
  const fullName =
    textField(row, 'fullName', 'name') ||
    [firstName, lastName].filter(Boolean).join(' ')

  return {
    id,
    firstName,
    lastName,
    fullName,
    dateOfBirth:
      textField(row, 'dateOfBirth', 'dob') || null,
    phoneNumber: textField(
      row,
      'phoneNumber',
      'phone',
      'mobileNumber'
    ),
    email: textField(row, 'email'),
    address: textField(row, 'address'),
    patientNumber: textField(
      row,
      'patientNumber',
      'fileNumber'
    ),
  }
}

function parsePatients(response: unknown): Patient[] {
  const root = asRecord(response)

  const items: unknown = Array.isArray(response)
    ? response
    : root?.items ??
      root?.patients ??
      root?.data ??
      root?.results

  if (!Array.isArray(items)) {
    throw new Error(
      'Unexpected patient directory response.'
    )
  }

  return items.map(parsePatient)
}

// =============================================
// PATIENTS PAGE
// =============================================




// CT_REGISTRATION_WIZARD_V3
function calculateRegistrationAge(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null

  const [year, month, day] = dob.split('-').map(Number)
  const birth = new Date(year, month - 1, day)
  const today = new Date()

  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day ||
    birth > today
  ) return null

  let age = today.getFullYear() - year

  if (
    today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day)
  ) age--

  return age
}

type PatientsPageProps = {
  autoOpenRegistration?: boolean
  onRegistrationExit?: () => void
  onExistingPatientSelect?: (patientId: string) => void
}

export default function PatientsPage({
  autoOpenRegistration = false,
  onRegistrationExit,
  onExistingPatientSelect,
}: PatientsPageProps) {
  const { user } = useAuth()

  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState('')

  const [showRegistration, setShowRegistration] =
    useState(autoOpenRegistration)


  // CT_DIRECT_QUICK_REGISTRATION_V1
  useEffect(() => {
    if (autoOpenRegistration && !showRegistration) {
      onRegistrationExit?.()
    }
  }, [autoOpenRegistration, showRegistration, onRegistrationExit])

  const [selectedPatient, setSelectedPatient] =
    useState<Patient | null>(null)

  const [form, setForm] = useState<PatientForm>(emptyForm)
  const [registrationStep, setRegistrationStep] = useState(0)
  const [registrationExtras, setRegistrationExtras] = useState<RegistrationExtrasState>(initialRegistrationExtras)
  const [registrationDeclaration, setRegistrationDeclaration] = useState<{
    signerName: string; signerCapacity: string; signatureDataUrl: string;
    witnessName: string|null; witnessSignatureDataUrl: string|null;
    signedAtUtc: string; responsibleName: string|null;
    responsibleRelationship: string|null; declarationVersion: string;
  }|null>(null)
  const [declarationError, setDeclarationError] = useState('')
  const [declarationLoading, setDeclarationLoading] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [duplicateWarning, setDuplicateWarning] =
    useState(false)

  const [reloadKey, setReloadKey] = useState(0)

  // Receptionist and PracticeAdmin can register patients.
  // The backend is the final authority on permissions.
  const canRegister =
    user?.role === 'Receptionist' ||
    user?.role === 'PracticeAdmin'

  const fieldStyle: CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    boxSizing: 'border-box',
    borderRadius: 9,
    border: '1px solid #90a4ae70',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
  }

  const labelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    fontWeight: 600,
    fontSize: 13,
  }

  // =========================================
  // LOAD PATIENTS FROM POSTGRESQL VIA API
  // =========================================

  useEffect(() => {
    let cancelled = false

    apiRequest<unknown>('/patients')
      .then(parsePatients)
      .then((items) => {
        if (cancelled) return

        setPatients(items)
        setError('')
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return

        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load patients.'
        )
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  function refresh() {
    setError('')
    setLoading(true)
    setReloadKey((value) => value + 1)
  }

  // Update individual registration fields.
  function updateField(
    field: keyof PatientForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  // =========================================
  // REGISTER PATIENT
  //
  // POST /api/patients
  //
  // ASP.NET Core validates and saves the record.
  // =========================================


  // The six-step workflow remains internal; client requested no visible progress strip.
  const [existingPatientSearch, setExistingPatientSearch] = useState('')
  const [cityTown, setCityTown] = useState('')
  const [suburb, setSuburb] = useState('')
  const [showResponsible, setShowResponsible] = useState(false)
  const locality = getLocality(cityTown, suburb)
  const verifiedPostalCode = getVerifiedPostalCode(cityTown, suburb)
  const suburbOptions = getSuburbs(cityTown)
  function setLocation(city: string, area: string) {
    setCityTown(city)
    setSuburb(area)
    const detail = getLocality(city, area)
    updateField('address', [area.trim(), city.trim(), detail.province, 'South Africa'].filter(Boolean).join(', '))
  }

  const patientAge = calculateRegistrationAge(form.dateOfBirth)
  const isMinor = patientAge !== null && patientAge < 18

  function nextRegistrationStep() {
    setError('')
    if (registrationStep === 1) {
      if (!form.firstName.trim() || !form.lastName.trim() || patientAge === null) {
        setError('A valid first name, surname and date of birth are required.')
        return
      }
    }
    if (registrationStep === 2) {
      if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        setError('Enter a valid email address.')
        return
      }
      if (!cityTown.trim() || !suburb.trim()) {
        setError('Enter the city/town and suburb.')
        return
      }
      if (isMinor && (!registrationExtras.responsibleName.trim() ||
          !registrationExtras.responsibleRelationship.trim() ||
          !registrationExtras.responsiblePhone.trim())) {
        setError('A minor must have parent/guardian contact details.')
        return
      }
    }
    if (registrationStep === 3 && form.paymentMethod === 'MedicalAid' &&
        (!form.medicalAidScheme.trim() || !form.medicalAidMemberNumber.trim())) {
      setError('Medical aid scheme and membership number are required.')
      return
    }
    if (registrationStep === 4 && isMinor) {
      setRegistrationExtras(v => ({...v,signerCapacity:'ParentOrGuardian'}))
    }
    setRegistrationStep(current => Math.min(current + 1, 5))
  }

  function previousRegistrationStep() {
    setError('')
    setRegistrationStep(current => Math.max(current - 1, 0))
  }

  async function savePatient(
    allowDuplicate = false
  ) {
    setError('')
    setSuccess('')

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and surname are required.')
      return
    }

    if (!form.dateOfBirth) {
      setError('Please enter the patient date of birth.')
      return
    }

    if (form.dateOfBirth > new Date().toLocaleDateString('en-CA')) {
      setError('Date of birth cannot be in the future.')
      return
    }

    // CT_REGISTRATION_VALIDATION_DIAGNOSTICS_V1
    if (!registrationExtras.declarationAccepted) {
      setError('Please tick the declaration confirming that the patient information is accurate.')
      return
    }

    if (!registrationExtras.informationConsent) {
      setError('Please acknowledge the privacy notice before completing registration.')
      return
    }

    if (!registrationExtras.signerName.trim()) {
      setError('Enter the full name of the patient or parent/guardian who is signing.')
      return
    }

    if (!registrationExtras.signatureDataUrl ||
        !registrationExtras.signatureDataUrl.startsWith('data:image/png;base64,')) {
      setError('Please draw the patient or parent/guardian signature before completing registration.')
      return
    }

    if (isMinor && !registrationExtras.guardianConsent) {
      setError('Parent or guardian acknowledgement is required for a minor.')
      return
    }

    if (isMinor && registrationExtras.signerCapacity !== 'ParentOrGuardian') {
      setError('For a minor, the signature must be recorded as Parent or Guardian.')
      return
    }
    setSaving(true)

    try {
      // Keep these field names aligned with
      // CreatePatientRequest in Contracts.cs.
      const request = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dateOfBirth: form.dateOfBirth,
        gender: form.gender || null,
        emergencyContactName: form.emergencyContactName.trim() || null,
        emergencyContactPhone: form.emergencyContactPhone.trim() || null,
        paymentMethod: form.paymentMethod,
        medicalAidScheme: form.paymentMethod === 'MedicalAid'
          ? form.medicalAidScheme.trim() : null,
        medicalAidOption: form.paymentMethod === 'MedicalAid'
          ? form.medicalAidOption.trim() || null : null,
        medicalAidMemberNumber: form.paymentMethod === 'MedicalAid'
          ? form.medicalAidMemberNumber.trim() : null,
        consentGiven: form.consentGiven,
        phoneNumber: form.phoneNumber.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        registration: {
          homePhone: registrationExtras.homePhone.trim() || null,
          workPhone: registrationExtras.workPhone.trim() || null,
          occupation: registrationExtras.occupation.trim() || null,
          employer: registrationExtras.employer.trim() || null,
          responsibleName: registrationExtras.responsibleName.trim() || null,
          responsibleRelationship: registrationExtras.responsibleRelationship.trim() || null,
          responsiblePhone: registrationExtras.responsiblePhone.trim() || null,
          responsibleEmail: registrationExtras.responsibleEmail.trim() || null,
          responsibleAddress: registrationExtras.responsibleAddress.trim() || null,
          responsibleIdNumber: null,
          profileJson: JSON.stringify({
            title: registrationExtras.title,
            middleNames: registrationExtras.middleNames,
            preferredName: registrationExtras.preferredName,
            previousSurname: registrationExtras.previousSurname,
            pronouns: registrationExtras.pronouns,
            language: registrationExtras.language,
            cityTown, suburb, province: locality.province,
            postalCode: verifiedPostalCode,
            country: 'South Africa',
            preferredContact: registrationExtras.preferredContact,
            guardianConsent: isMinor ? registrationExtras.guardianConsent : null,
            orthodonticPatient: registrationExtras.orthodonticPatient,
          }),
          declarationAccepted: registrationExtras.declarationAccepted,
          informationConsent: registrationExtras.informationConsent,
          signerName: registrationExtras.signerName.trim(),
          signerCapacity: registrationExtras.signerCapacity,
          signatureDataUrl: registrationExtras.signatureDataUrl,
          witnessName: registrationExtras.witnessName.trim() || null,
          witnessSignatureDataUrl: registrationExtras.witnessSignatureDataUrl || null,
        },
        registrationMedicalHistory: {
          allergies: registrationExtras.allergies.trim() || null,
          currentMedications: registrationExtras.medications.trim() || null,
          medicalConditions: [registrationExtras.medicalConditions.trim(),
            registrationExtras.extraConditions.length ? `Other selected conditions: ${registrationExtras.extraConditions.join(', ')}` : '',
            registrationExtras.hypertension === 'Yes' ? `Hypertension details: medication=${registrationExtras.bpMedicine}; strength=${registrationExtras.bpDose}; frequency=${registrationExtras.bpFrequency}; controlled=${registrationExtras.bpControlled}; recent reading=${registrationExtras.bpRecent}` : '',
            registrationExtras.diabetes === 'Yes' ? `Diabetes details: type=${registrationExtras.diabetesType}; management=${registrationExtras.diabetesManagement}; medication=${registrationExtras.diabetesMedicine}; strength=${registrationExtras.diabetesDose}; frequency=${registrationExtras.diabetesFrequency}; recent low sugar=${registrationExtras.diabetesLowSugar}` : '',
            `Diabetes: ${registrationExtras.diabetes}`,
            `High blood pressure: ${registrationExtras.hypertension}`,
            `Bleeding disorder: ${registrationExtras.bleedingDisorder}`,
            `Heart condition: ${registrationExtras.heartCondition}`,
            `Relevant infectious conditions: ${registrationExtras.infectiousCondition}`,
            `Pregnancy / other considerations: ${registrationExtras.pregnancy}`,
          ].filter(Boolean).join('\n').slice(0,4000),
          dentalHistory: registrationExtras.dentalHistory.trim() || null,
          additionalNotes: registrationExtras.medicalNotes.trim() || null,
        },
      }

      const path = allowDuplicate
        ? '/patients?allowDuplicate=true'
        : '/patients'

      await apiRequest<unknown>(
        path,
        'POST',
        request
      )

      // Save succeeded.
      setSuccess('Patient registered successfully.')
      setForm(emptyForm)
      setCityTown('')
      setSuburb('')
      setRegistrationExtras(initialRegistrationExtras)
      setRegistrationStep(0)
      setDuplicateWarning(false)
      setShowRegistration(false)
      setSelectedPatient(null)

      // Reload records from PostgreSQL.
      refresh()
    } catch (cause: unknown) {
      if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        !allowDuplicate
      ) {
        setDuplicateWarning(true)
        setError(
          'A possible duplicate patient was found. ' +
          'Check the existing records before proceeding.'
        )
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Patient registration failed.'
        )
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleRegister(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    await savePatient()
  }

  // =========================================
  // VIEW INDIVIDUAL PATIENT
  // GET /api/patients/{id}
  // =========================================

  async function viewDeclaration(id: string) {
    setDeclarationLoading(true)
    setDeclarationError('')
    try {
      const record = await apiRequest<{
        signerName:string; signerCapacity:string; signatureDataUrl:string;
        witnessName:string|null; witnessSignatureDataUrl:string|null;
        signedAtUtc:string; responsibleName:string|null;
        responsibleRelationship:string|null; declarationVersion:string;
      }>(`/patients/${encodeURIComponent(id)}/registration-declaration`)
      setRegistrationDeclaration(record)
    } catch (cause) {
      setDeclarationError(cause instanceof ApiError && cause.status === 404
        ? 'No signed registration declaration exists for this legacy patient.'
        : cause instanceof Error ? cause.message : 'Unable to load declaration.')
    } finally { setDeclarationLoading(false) }
  }

  async function openPatient(patient: Patient) {
    setError('')
    setSelectedPatient(null)
    setRegistrationDeclaration(null)
    setDeclarationError('')

    try {
      const response = await apiRequest<unknown>(
        `/patients/${encodeURIComponent(patient.id)}`
      )

      setSelectedPatient(parsePatient(response))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to open patient record.'
      )
    }
  }

  // Client-side search for currently loaded patients.
  const visiblePatients = patients.filter((patient) => {
    const query = search.trim().toLowerCase()

    return [
      patient.fullName,
      patient.phoneNumber,
      patient.patientNumber,
      patient.email,
    ].some((value) =>
      value.toLowerCase().includes(query)
    )
  })

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >

      {/* ======================================
          PAGE HEADER
          ====================================== */}
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            PATIENT MANAGEMENT
          </div>

          <h1>Patients</h1>

          <p>
            Register patients and manage records
            for {user?.practiceName ?? 'your practice'}.
          </p>
        </div>

        {canRegister && !showRegistration && (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setRegistrationStep(0)
              setExistingPatientSearch('')
              setCityTown('')
              setSuburb('')
              setShowResponsible(false)
              setRegistrationExtras(initialRegistrationExtras)
              setShowRegistration(true)
              setSelectedPatient(null)
              setError('')
              setSuccess('')
              setDuplicateWarning(false)
            }}
          >
            <UserPlus size={18} />
            Register Patient
          </button>
        )}
      </div>

      {/* ======================================
          NOTIFICATIONS
          ====================================== */}

      {error && (
        <div
          role="alert"
          style={{
            padding: 15,
            borderRadius: 10,
            border: '1px solid #d77a7a',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <AlertCircle size={19} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          style={{
            padding: 15,
            borderRadius: 10,
            border: '1px solid #5da98b',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <CheckCircle2 size={19} />
          <span>{success}</span>
        </div>
      )}

      {/* ======================================
          PATIENT REGISTRATION FORM
          ====================================== */}

      {showRegistration && (
        <div className="ct-reg-v3-overlay"><section className="panel ct-reg-v3-modal" role="dialog" aria-modal="true" aria-label="New Patient Registration">
          <div className="panel-header">
            <div>
              <h2>Register New Patient</h2>
              <p>Enter patient details, medical history and the signed declaration.</p>
            </div>

            <UserPlus size={22} />
          </div>


          <form onSubmit={handleRegister} noValidate className="ct-wizard-form">
          <div className="ct-reg-v3-content">
            {registrationStep === 0 && (
              <section className="ct-wizard-section">
                <h3>Find existing patient</h3>
                <p>Search your authorised patient directory before creating a new record.</p>
                <label className="ct-reg-label">Search by name<input value={existingPatientSearch} placeholder="Type patient name" onChange={event=>setExistingPatientSearch(event.target.value)}/></label>
                {existingPatientSearch.trim().length >= 2 && (
                  <div className="ct-reg-v3-existing">{patients.filter(x=>`${x.firstName} ${x.lastName}`.toLowerCase().includes(existingPatientSearch.trim().toLowerCase())).slice(0,6).map(x=><button key={x.id} type="button" className="secondary-button" onClick={()=>{setShowRegistration(false);
                      if (autoOpenRegistration && onExistingPatientSelect) {
                        onExistingPatientSelect(x.id)
                      } else {
                        void openPatient(x)
                      }}}>{x.firstName} {x.lastName} — Open existing record</button>)}
                    {patients.filter(x=>`${x.firstName} ${x.lastName}`.toLowerCase().includes(existingPatientSearch.trim().toLowerCase())).length===0 && <p>No matches in the currently loaded directory. Confirm before creating a new patient.</p>}
                  </div>
                )}
                <p className="ct-wizard-notice">If no existing patient is found, continue to register a new patient. Duplicate detection also runs when saving.</p>
              </section>
            )}
            {registrationStep === 1 && (
              <section className="ct-wizard-section">
                <h3>Personal details</h3>
                <p>Enter the patient's information. An ID number is not required.</p>


                <div className="ct-wizard-grid ct-patient-personal-grid">
                  <label className="ct-reg-label ct-personal-title">
                    Title
                    <select value={registrationExtras.title}
                      onChange={event => setRegistrationExtras(value => ({...value, title:event.target.value}))}>
                      <option value="">Select title</option>
                      {['Mr','Mrs','Ms','Miss','Mx','Dr','Prof'].map(title => <option key={title}>{title}</option>)}
                    </select>
                  </label>
                  <label style={labelStyle}>
                    First name *
                    <input
                      style={fieldStyle}
                      maxLength={100}
                      value={form.firstName}
                      onChange={event => updateField('firstName', event.target.value)}
                    />
                  </label>

                  <label style={labelStyle}>
                    Surname *
                    <input
                      style={fieldStyle}
                      maxLength={100}
                      value={form.lastName}
                      onChange={event => updateField('lastName', event.target.value)}
                    />
                  </label>

                  <label className="ct-reg-label ct-personal-middle">
                    Middle name(s) (optional)
                    <input maxLength={200} value={registrationExtras.middleNames}
                      onChange={event => setRegistrationExtras(value => ({...value, middleNames:event.target.value}))}/>
                  </label>

                  <div className="ct-wizard-dob-row">
                  <label style={labelStyle}>
                    Date of birth *
                    <input
                      style={fieldStyle}
                      type="date"
                      value={form.dateOfBirth}
                      onChange={event => updateField('dateOfBirth', event.target.value)}
                    />
                  </label>

                    <div
                      className={
                        'ct-wizard-age-badge' +
                        (isMinor ? ' is-minor' : '')
                      }
                      role="status"
                      aria-live="polite"
                    >
                      <span className="ct-wizard-age-label">
                        Age:
                      </span>

                      {patientAge === null ? (
                        <strong className="ct-wizard-age-placeholder">
                          Select a valid DOB
                        </strong>
                      ) : (
                        <>
                          <strong className="ct-wizard-age-number">
                            {patientAge}
                            <small>
                              {patientAge === 1 ? ' year' : ' years'}
                            </small>
                          </strong>
                        </>
                      )}
                    
                      {/* CT_MINOR_GUARDIAN_STATUS_V1 */}
                      {isMinor && (
                        <span className="ct-minor-guardian-status">
                          Minor — Guardian required
                        </span>
                      )}
</div>
                  </div>

                  <label style={labelStyle}>
                    Gender
                    <select
                      style={fieldStyle}
                      value={form.gender}
                      onChange={event => updateField('gender', event.target.value)}
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </label>
                  <label className="ct-reg-label ct-personal-pronouns">
                    Preferred pronouns (optional)
                    <select value={registrationExtras.pronouns}
                      onChange={event => setRegistrationExtras(value => ({...value, pronouns:event.target.value}))}>
                      {['','He / Him','She / Her','They / Them','Other','Prefer not to say'].map(option =>
                        <option key={option} value={option}>{option || 'Not specified'}</option>)}
                    </select>
                  </label>
                </div>


              
<div className="ct-reg-v3-mini-grid ct-reg-language-bottom">
                  <label className="ct-reg-label">Communication language<select value={registrationExtras.language} onChange={event => setRegistrationExtras(v => ({...v,language:event.target.value}))}>{['English','Sesotho','Setswana','isiZulu','isiXhosa','Afrikaans','Sepedi','siSwati','Other'].map(s=><option key={s}>{s}</option>)}</select></label>
</div>

</section>
            )}

            {registrationStep === 2 && (
              <section className="ct-wizard-section">
                <h3>Contact & emergency</h3>
                <div className="ct-wizard-grid">
                  <label style={labelStyle}>
                    Contact number
                    <input
                      style={fieldStyle}
                      type="tel"
                      maxLength={30}
                      value={form.phoneNumber}
                      onChange={event => updateField('phoneNumber', event.target.value)}
                    />
                  </label>

                  <label style={labelStyle}>
                    Email address
                    <input
                      style={fieldStyle}
                      type="email"
                      maxLength={256}
                      value={form.email}
                      onChange={event => updateField('email', event.target.value)}
                    />
                  </label>

                  <div className="ct-reg-v3-location">
                    {/* CT_SA_SMART_LOCATION_V1 */}
    
{/* CT_COMPACT_OTHER_V5 */}
<RegistrationOtherPicker
  kind="city"
  value={cityTown}
  choices={getCities()}
  suggestions={getCities()}
  onChange={value => setLocation(value, '')}
/>

                    
<RegistrationOtherPicker
  key={cityTown}
  kind="suburb"
  value={suburb}
  choices={suburbOptions}
  suggestions={suburbOptions}
  onChange={value => setLocation(cityTown, value)}
/>

                    <small>Province, country and postal code are shown at review. When a postal code cannot be verified, it is left unconfirmed.</small>
                  </div>
                  <label className="ct-reg-label">Preferred contact method<select value={registrationExtras.preferredContact} onChange={event=>setRegistrationExtras(v=>({...v,preferredContact:event.target.value}))}>{['Phone call','SMS','WhatsApp','Email','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
                </div>
              </section>
            )}

            {registrationStep === 2 && (
              <section className="ct-wizard-section">
                <h3>Emergency contact</h3>
                {isMinor && (
                  <p className="ct-wizard-notice">
                    This patient is {patientAge} years old.
                    Capture a parent or guardian contact.
                    Legal authority and treatment consent must be verified separately.
                  </p>
                )}

                <div className="ct-wizard-grid">
                  <label style={labelStyle}>
                    Contact name {isMinor ? '*' : ''}
                    <input
                      style={fieldStyle}
                      maxLength={200}
                      value={form.emergencyContactName}
                      onChange={event => updateField('emergencyContactName', event.target.value)}
                    />
                  </label>

                  <label style={labelStyle}>
                    Contact phone {isMinor ? '*' : ''}
                    <input
                      style={fieldStyle}
                      type="tel"
                      maxLength={30}
                      value={form.emergencyContactPhone}
                      onChange={event => updateField('emergencyContactPhone', event.target.value)}
                    />
                  </label>
                </div>
              </section>
            )}

            {registrationStep === 2 && !isMinor && (
              <label className="ct-reg-v3-toggle"><input type="checkbox" checked={showResponsible} onChange={event=>setShowResponsible(event.target.checked)}/>Add a responsible person / authorised representative (optional for adults)</label>
            )}
            {registrationStep === 2 && (isMinor || showResponsible) && (
              <RegistrationResponsibleScreen value={registrationExtras} onChange={setRegistrationExtras} isMinor={isMinor} />
            )}
            {registrationStep === 3 && (
              <section className="ct-wizard-section">
                <h3>Payment & medical aid</h3>
                <div className="ct-wizard-grid">
                  <label style={labelStyle}>
                    Billing category
                    <select
                      style={fieldStyle}
                      value={form.paymentMethod}
                      onChange={event => updateField('paymentMethod', event.target.value)}
                    >
                      <option value="Cash">Private / Cash</option>
                      <option value="MedicalAid">Medical Aid</option>
                    </select>
                  </label>

                  {form.paymentMethod === 'MedicalAid' && (
                    <>
                      <label style={labelStyle}>
                        Medical aid scheme *
                        <input
                          style={fieldStyle}
                          maxLength={100}
                          value={form.medicalAidScheme}
                          onChange={event => updateField('medicalAidScheme', event.target.value)}
                        />
                      </label>

                      <label style={labelStyle}>
                        Plan / Option
                        <input
                          style={fieldStyle}
                          maxLength={100}
                          value={form.medicalAidOption}
                          onChange={event => updateField('medicalAidOption', event.target.value)}
                        />
                      </label>

                      <label style={labelStyle}>
                        Membership number *
                        <input
                          style={fieldStyle}
                          maxLength={50}
                          value={form.medicalAidMemberNumber}
                          onChange={event => updateField('medicalAidMemberNumber', event.target.value)}
                        />
                      </label>
                    </>
                  )}
                </div>

                <p>
                  Medical-aid registration does not confirm benefits,
                  authorisation or payment.
                </p>
              </section>
            )}

            {registrationStep === 4 && (
              <RegistrationMedicalScreen value={registrationExtras} onChange={setRegistrationExtras} />
            )}

            {registrationStep === 5 && (
              <section className="ct-wizard-section">
                <h3>Review details</h3>
                <p>Check the patient details before completing registration.</p>

                {/* CT_COMPACT_MEDICAL_REVIEW_V1 */}
<details className="ct-reg-review-fold">
  <summary>Patient, contact and payment details</summary>
<div className="ct-wizard-review">
                  <p><strong>Name:</strong> {form.firstName} {form.lastName}</p>
                  <p><strong>DOB:</strong> {form.dateOfBirth}</p>
                  <p><strong>Age:</strong> {patientAge ?? 'Invalid'}</p>
                  <p><strong>Category:</strong> {isMinor ? 'Minor' : 'Adult'}</p>
                  <p><strong>Gender:</strong> {form.gender || 'Not specified'}</p>
                  <p><strong>Phone:</strong> {form.phoneNumber || 'Not supplied'}</p>
                  <p><strong>Email:</strong> {form.email || 'Not supplied'}</p>
                  <p><strong>City/Town:</strong> {cityTown || 'Not supplied'}</p>
                  <p><strong>Suburb:</strong> {suburb || 'Not supplied'}</p>
                  <p><strong>Province:</strong> {locality.province || 'Not confirmed — verify before use'}</p>
                  <p><strong>Postal code:</strong> {verifiedPostalCode || 'Not confirmed — verify manually'}</p>
                  <p><strong>Country:</strong> South Africa</p>
                  <p><strong>Next of kin:</strong> {form.emergencyContactName || 'Not supplied'}</p>
                  <p><strong>Emergency phone:</strong> {form.emergencyContactPhone || 'Not supplied'}</p>
                  <p><strong>Payment:</strong> {form.paymentMethod}</p>

                  {form.paymentMethod === 'MedicalAid' && (
                    <>
                      <p><strong>Scheme:</strong> {form.medicalAidScheme}</p>
                      <p><strong>Plan:</strong> {form.medicalAidOption || 'Not supplied'}</p>
                      <p><strong>Member number:</strong> {form.medicalAidMemberNumber}</p>
                    </>
                  )}

                  <p>
                    <strong>Information-processing consent:</strong>{' '}
                    {form.consentGiven ? 'Recorded' : 'Not recorded'}
                  </p>
                </div>
</details>

                <details className="ct-reg-review-fold">
  <summary>Medical history and additional details</summary>
  <RegistrationExtrasReview value={registrationExtras} />
</details>
                <p className="ct-wizard-notice">Review the registration carefully. The dentist must separately verify clinical history and obtain procedure-specific consent before treatment.</p>
              </section>
            )}

            {registrationStep === 5 && (
              <RegistrationDeclarationScreen value={{...registrationExtras,signerCapacity:isMinor && registrationExtras.signerCapacity === 'Patient' ? 'ParentOrGuardian' : registrationExtras.signerCapacity}} onChange={setRegistrationExtras} isMinor={isMinor} />
            )}

          </div>
            {error && <p role="alert" className="ct-wizard-error">{error}</p>}

            {duplicateWarning && registrationStep === 5 && (
              <div className="ct-wizard-notice" role="alert">
                <strong>Possible duplicate patient found.</strong>
                <p>
                  Check the existing patient directory before proceeding.
                  Registering anyway creates another patient record.
                </p>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => void savePatient(true)}
                >
                  Register Anyway
                </button>
              </div>
            )}

            <div className="ct-wizard-actions">
              {registrationStep > 0 && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  onClick={previousRegistrationStep}
                >
                  Back
                </button>
              )}

              {registrationStep < 5 ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={saving}
                  onClick={nextRegistrationStep}
                >
                  Next Step
                </button>
              ) : (
                <button
                  type="submit"
                  className="primary-button"
                  disabled={saving}
                >
                  <UserPlus size={17} />
                  {saving ? 'Saving patient...' : 'Complete Registration'}
                </button>
              )}

              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={() => {
                  setShowRegistration(false)
                  setRegistrationStep(0)
                  setDuplicateWarning(false)
                  setError('')
                }}
              >
                Cancel
              </button>
            </div>
          </form>

        </section></div>
      )}

      {/* ======================================
          INDIVIDUAL PATIENT RECORD
          ====================================== */}

      {selectedPatient && !showRegistration && (
        <section className="panel">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setSelectedPatient(null)}
          >
            <ArrowLeft size={17} />
            Back to Patients
          </button>

          <div
            className="panel-header"
            style={{ marginTop: 22 }}
          >
            <div>
              <h2>
                {selectedPatient.fullName || 'Patient Record'}
              </h2>
              <p>
                {selectedPatient.patientNumber ||
                  selectedPatient.id}
              </p>
            </div>

            <Users size={22} />
          </div>

          <div className="check-list">
            <div>
              <CalendarDays size={15} />{' '}
              Date of birth:{' '}
              {selectedPatient.dateOfBirth
                ? selectedPatient.dateOfBirth.slice(0, 10)
                : 'Not recorded'}
            </div>

            <div>
              <Phone size={15} />{' '}
              Contact:{' '}
              {selectedPatient.phoneNumber ||
                'Not recorded'}
            </div>

            <div>
              <Mail size={15} />{' '}
              Email:{' '}
              {selectedPatient.email || 'Not recorded'}
            </div>

            <div>
              <MapPin size={15} />{' '}
              Address:{' '}
              {selectedPatient.address || 'Not recorded'}
            </div>
          </div>
        </section>
      )}

      {/* CT_REGISTRATION_DECLARATION_REVIEW_V2: restrict signatures to Dentist and PracticeAdmin */}
      {selectedPatient && (user?.role === 'Dentist' || user?.role === 'PracticeAdmin') && (
        <section className="panel ct-reg-declaration-review">
          <h3>Signed registration declaration</h3>
          <button className="secondary-button" type="button" disabled={declarationLoading}
            onClick={() => void viewDeclaration(selectedPatient.id)}>
            {declarationLoading ? 'Loading declaration…' : 'View signed declaration'}
          </button>
          {declarationError && <p role="status">{declarationError}</p>}
          {registrationDeclaration && <div className="ct-reg-declaration">
            <p><strong>Signer:</strong> {registrationDeclaration.signerName} ({registrationDeclaration.signerCapacity})</p>
            <p><strong>Responsible person:</strong> {registrationDeclaration.responsibleName || 'Not supplied'} — {registrationDeclaration.responsibleRelationship || 'Not supplied'}</p>
            <p><strong>Recorded:</strong> {new Date(registrationDeclaration.signedAtUtc).toLocaleString()}</p>
            <p><strong>Declaration version:</strong> {registrationDeclaration.declarationVersion}</p>
            <img className="ct-reg-sign-preview" src={registrationDeclaration.signatureDataUrl} alt="Captured patient declaration signature" />
            {registrationDeclaration.witnessName && <p><strong>Witness:</strong> {registrationDeclaration.witnessName}</p>}
            {registrationDeclaration.witnessSignatureDataUrl && <img className="ct-reg-sign-preview" src={registrationDeclaration.witnessSignatureDataUrl} alt="Captured staff witness signature" />}
          </div>}
        </section>
      )}

      {/* ======================================
          PATIENT DIRECTORY
          ====================================== */}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Patient Directory</h2>
            <p>
              Search registered patients in your practice.
            </p>
          </div>

          <Users size={22} />
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            margin: '20px 0',
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 210,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Search size={18} />

            <input
              type="search"
              aria-label="Search patients"
              placeholder="Search patients..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              style={fieldStyle}
            />
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={17} />
            Refresh
          </button>
        </div>

        {loading ? (
          <p>Loading patients...</p>
        ) : error && patients.length === 0 ? (
          <p>Unable to display patient records.</p>
        ) : visiblePatients.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 35,
            }}
          >
            <Users size={32} />

            <h2>
              {search
                ? 'No matching patients'
                : 'No patients registered yet'}
            </h2>

            <p>
              {search
                ? 'Try a different search.'
                : 'Register your first patient to get started.'}
            </p>
          </div>
        ) : (
          <div className="check-list">
            {visiblePatients.map((patient) => (
              <button
                type="button"
                key={patient.id}
                onClick={() => void openPatient(patient)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 14,
                  textAlign: 'left',
                  border: '1px solid #90a4ae50',
                  borderRadius: 10,
                  padding: 15,
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <strong>
                    {patient.fullName || 'Unnamed patient'}
                  </strong>

                  <p
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                      margin: '5px 0 0',
                    }}
                  >
                    {patient.patientNumber || patient.phoneNumber ||
                      'View patient information'}
                  </p>
                </div>

                <ArrowLeft
                  size={17}
                  style={{ transform: 'rotate(180deg)' }}
                />
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="panel-note">
        The directory loads through the authenticated
        CurvTab Dental API. Only use synthetic patient
        information while testing.
      </p>
    </div>
  )
}
