
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


function calculatePatientAge(value: string): number | null {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
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

export default function PatientsPage() {
  const { user } = useAuth()

  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState('')

  const [showRegistration, setShowRegistration] =
    useState(false)

  const [selectedPatient, setSelectedPatient] =
    useState<Patient | null>(null)

  const [form, setForm] = useState<PatientForm>(emptyForm)

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

  async function openPatient(patient: Patient) {
    setError('')
    setSelectedPatient(null)

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
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Register New Patient</h2>
              <p>Enter the patient's basic information.</p>
            </div>

            <UserPlus size={22} />
          </div>

          <form
            onSubmit={handleRegister}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              marginTop: 22,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              <label style={labelStyle}>
                First name *

                <input
                  style={fieldStyle}
                  required
                  value={form.firstName}
                  onChange={(event) =>
                    updateField(
                      'firstName',
                      event.target.value
                    )
                  }
                  placeholder="Patient first name"
                />
              </label>

              <label style={labelStyle}>
                Surname *

                <input
                  style={fieldStyle}
                  required
                  value={form.lastName}
                  onChange={(event) =>
                    updateField(
                      'lastName',
                      event.target.value
                    )
                  }
                  placeholder="Patient surname"
                />
              </label>

              <label style={labelStyle}>
                Date of birth *

                <input
                  style={fieldStyle}
                  required
                  type="date"
                  value={form.dateOfBirth}
                  max={new Date().toLocaleDateString('en-CA')}
                  onChange={(event) =>
                    updateField(
                      'dateOfBirth',
                      event.target.value
                    )
                  }
                />
              </label>


              {form.dateOfBirth && (
                <div
                  role="status"
                  className="ct-registration-age"
                  style={{
                    gridColumn: '1 / -1',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid currentColor'
                  }}
                >
                  {calculatePatientAge(form.dateOfBirth) === null ? (
                    <strong>Enter a valid date of birth.</strong>
                  ) : (
                    <>
                      <strong>
                        Age: {calculatePatientAge(form.dateOfBirth)} years
                      </strong>
                      <p style={{ margin: '6px 0 0' }}>
                        {calculatePatientAge(form.dateOfBirth)! < 18
                          ? 'Minor patient: guardian details and applicable consent requirements must be reviewed.'
                          : 'Adult patient'}
                      </p>
                    </>
                  )}
                </div>
              )}

              <label style={labelStyle}>
                Contact number

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Phone size={17} />

                  <input
                    style={fieldStyle}
                    type="tel"
                    value={form.phoneNumber}
                    onChange={(event) =>
                      updateField(
                        'phoneNumber',
                        event.target.value
                      )
                    }
                    placeholder="e.g. 0821234567"
                  />
                </div>
              </label>

              <label style={labelStyle}>
                Email address

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Mail size={17} />

                  <input
                    style={fieldStyle}
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateField(
                        'email',
                        event.target.value
                      )
                    }
                    placeholder="patient@example.com"
                  />
                </div>
              </label>

              <label style={labelStyle}>
                Residential address

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <MapPin size={17} />

                  <input
                    style={fieldStyle}
                    value={form.address}
                    onChange={(event) =>
                      updateField(
                        'address',
                        event.target.value
                      )
                    }
                    placeholder="Patient address"
                  />
                </div>
              </label>
            </div>


            <div className="ct-registration-extra">
              <h3>Additional personal details</h3>
              <label style={labelStyle}>
                Gender
                <select
                  style={fieldStyle}
                  value={form.gender}
                  onChange={event => updateField('gender', event.target.value)}
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </label>

              <h3>Next of kin / Emergency contact</h3>
              <label style={labelStyle}>
                Contact name
                <input
                  style={fieldStyle}
                  maxLength={200}
                  value={form.emergencyContactName}
                  onChange={event => updateField('emergencyContactName', event.target.value)}
                />
              </label>
              <label style={labelStyle}>
                Contact phone
                <input
                  style={fieldStyle}
                  type="tel"
                  maxLength={30}
                  value={form.emergencyContactPhone}
                  onChange={event => updateField('emergencyContactPhone', event.target.value)}
                />
              </label>

              <h3>Billing category</h3>
              <label style={labelStyle}>
                Patient category
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
                      required
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
                      required
                      maxLength={50}
                      value={form.medicalAidMemberNumber}
                      onChange={event => updateField('medicalAidMemberNumber', event.target.value)}
                    />
                  </label>
                </>
              )}

              <h3>Patient declaration</h3>
              <p>
                Record consent to processing patient information.
                Signed declarations and clinical consent forms
                will be managed separately.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={form.consentGiven}
                  onChange={event =>
                    setForm(current => ({ ...current, consentGiven: event.target.checked }))
                  }
                />
                {' '}Patient confirms consent to processing of personal information.
              </label>
            </div>

            <p className="panel-note">
              Patient records are assigned to your current
              dental practice by the backend.
            </p>

            {/* Duplicate warning */}
            {duplicateWarning && (
              <div
                style={{
                  padding: 16,
                  border: '1px solid #d99e54',
                  borderRadius: 10,
                }}
              >
                <strong>Possible duplicate record</strong>

                <p>
                  Check the patient directory before
                  registering another record with the
                  same name and date of birth.
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

            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                <UserPlus size={17} />
                {saving
                  ? 'Saving Patient...'
                  : 'Save Patient'}
              </button>

              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={() => {
                  setShowRegistration(false)
                  setDuplicateWarning(false)
                  setError('')
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
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
