
import { useEffect, useState } from 'react'
import { Search, RefreshCw, Users, AlertCircle } from 'lucide-react'
import { apiRequest, ApiError } from '../services/api'
import './PatientsPage.css'

// The backend determines which patient fields each role may see.
// We only read fields needed for the patient list.
type Patient = Record<string, unknown>

// Convert an API value into a readable string without assuming
// every patient response contains the same optional fields.
function field(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// Accept common list-response structures.
// We will tighten this once we inspect your actual Patient DTO.
function extractPatients(response: unknown): Patient[] {
  let data: unknown = response

  if (!Array.isArray(data) && data && typeof data === 'object') {
    const object = data as Record<string, unknown>
    data = object.items ?? object.patients ?? object.data ?? object.results
  }

  if (!Array.isArray(data)) {
    throw new Error('Unexpected patient response format.')
  }

  return data.filter(
    (item): item is Patient =>
      typeof item === 'object' && item !== null && !Array.isArray(item)
  )
}

// Displays a patient's name using only fields actually returned.
function patientName(patient: Patient): string {
  const full = field(patient.fullName)
  const combined = [
    field(patient.firstName),
    field(patient.lastName),
  ].filter(Boolean).join(' ')

  return full || combined || 'Patient'
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // Requests only the patient data allowed by the backend.
  // React never supplies a practice ID or bypasses tenant isolation.
  useEffect(() => {
    let active = true

    apiRequest<unknown>('/patients')
      .then(response => {
        if (!active) return
        setPatients(extractPatients(response))
        setError('')
      })
      .catch((err: unknown) => {
        if (!active) return

        if (err instanceof ApiError && err.status === 403) {
          setError('Your account does not have permission to view patients.')
        } else {
          setError(
            err instanceof Error ? err.message : 'Unable to load patients.'
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [reloadKey])

  // This searches the records returned by the current API request.
  // Server-side pagination and global search come after DTO inspection.
  const visiblePatients = patients.filter(patient => {
    const searchable = [
      patientName(patient),
      field(patient.patientNumber),
      field(patient.fileNumber),
    ].join(' ').toLowerCase()

    return searchable.includes(query.toLowerCase().trim())
  })

  function reload() {
    setLoading(true)
    setReloadKey(value => value + 1)
  }

  return (
    <div className="patients-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">PATIENT MANAGEMENT</div>
          <h1>Patients</h1>
          <p>View patient records available to your dental practice.</p>
        </div>

        <button className="secondary-button" onClick={reload}>
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      <section className="panel">
        <div className="patients-toolbar">
          <div>
            <h2>Patient Directory</h2>
            <p>
              {loading ? 'Loading records...' : `${patients.length} records returned`}
            </p>
          </div>

          <div className="patients-search">
            <Search size={17} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search displayed patients"
              aria-label="Search displayed patients"
            />
          </div>
        </div>

        {error && (
          <div className="patients-error" role="alert">
            <AlertCircle size={19} />
            {error}
          </div>
        )}

        {!error && loading && (
          <p className="patients-message">Loading patient records...</p>
        )}

        {!error && !loading && visiblePatients.length === 0 && (
          <div className="patients-empty">
            <Users size={34} />
            <h3>No matching patients</h3>
            <p>
              {query
                ? 'Try a different name or patient number.'
                : 'The API returned no patients for this request.'}
            </p>
          </div>
        )}

        {!error && !loading && visiblePatients.length > 0 && (
          <div className="patients-table-scroll">
            <table className="patients-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Patient number</th>
                  <th>Record ID</th>
                </tr>
              </thead>
              <tbody>
                {visiblePatients.map((patient, index) => (
                  <tr key={field(patient.id) || index}>
                    <td>
                      <strong>{patientName(patient)}</strong>
                    </td>
                    <td>
                      {field(patient.patientNumber) ||
                        field(patient.fileNumber) || '—'}
                    </td>
                    <td className="patient-id">
                      {field(patient.id) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
