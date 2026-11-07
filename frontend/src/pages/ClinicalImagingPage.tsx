import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Images, Search, UserRound } from 'lucide-react'
import ClinicalImagingPanel from './ClinicalImagingPanel'
import { loadClinicalPatients } from '../utils/clinicalPatients'
import type { ClinicalPatient } from '../utils/clinicalPatients'
import './ClinicalImagingPage.css'

export default function ClinicalImagingPage() {
  const [patients, setPatients] = useState<ClinicalPatient[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false

    loadClinicalPatients()
      .then(rows => {
        if (!cancelled) {
          setPatients(rows)
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load patients.'
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [reload])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return patients.filter(patient =>
      patient.name.toLowerCase().includes(query)
    )
  }, [patients, search])

  const selectedPatient = patients.find(
    patient => patient.id === selectedPatientId
  )

  const initials = (name: string) =>
    name.trim().split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('')

  return (
    <div className="ct-imaging-page">

      {!selectedPatientId ? (
        <>
          <header className="ct-imaging-heading">
            <div className="ct-imaging-heading-icon">
              <Images size={26} />
            </div>
            <div>
              <h1>Clinical Imaging</h1>
              <p>
                Secure patient photographs,
                radiographs and image records.
              </p>
            </div>
          </header>

          <section className="ct-imaging-directory">
            <div className="ct-imaging-directory-title">
              <div>
                <h2>Select a Patient</h2>
                <p>
                  Open a patient to view and upload
                  their clinical images.
                </p>
              </div>

              <span>{patients.length} patients</span>
            </div>

            <div className="ct-imaging-search">
              <Search size={19} />
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search patients by name..."
                aria-label="Search clinical imaging patients"
              />
            </div>

            {error && (
              <div className="ct-imaging-error" role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true)
                    setReload(value => value + 1)
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            {loading ? (
              <p className="ct-imaging-empty">
                Loading patients...
              </p>
            ) : error ? null : (
              <>
                <div className="ct-imaging-patient-grid">
                  {filtered.map(patient => (
                    <button
                      type="button"
                      key={patient.id}
                      className="ct-imaging-patient-card"
                      onClick={() =>
                        setSelectedPatientId(patient.id)
                      }
                    >
                      <span className="ct-imaging-card-top">
                        <span className="ct-imaging-status">
                          Patient record
                        </span>
                        <span aria-hidden="true">↗</span>
                      </span>

                      <span className="ct-imaging-identity">
                        <span className="ct-imaging-avatar">
                          {initials(patient.name)}
                        </span>
                        <span className="ct-imaging-name">
                          <strong>{patient.name}</strong>
                          <small>Clinical image records</small>
                        </span>
                      </span>

                      <span className="ct-imaging-card-action">
                        Open imaging workspace →
                      </span>
                    </button>
                  ))}
                </div>

                {filtered.length === 0 && (
                  <p className="ct-imaging-empty">
                    {patients.length === 0
                      ? 'No registered patients found.'
                      : 'No patients match your search.'}
                  </p>
                )}
              </>
            )}
          </section>
        </>
      ) : (
        <>
          <header className="ct-imaging-workspace-header">
            <button
              type="button"
              className="ct-imaging-back"
              onClick={() => setSelectedPatientId('')}
            >
              <ArrowLeft size={17} />
              Back to Patients
            </button>

            <div className="ct-imaging-workspace-title">
              <span className="ct-imaging-heading-icon">
                <UserRound size={24} />
              </span>

              <div>
                <h1>
                  {selectedPatient?.name || 'Patient Imaging'}
                </h1>
                <p>
                  Clinical Imaging · Patient record
                </p>
              </div>
            </div>
          </header>

          <ClinicalImagingPanel
            key={selectedPatientId}
            patientId={selectedPatientId}
          />
        </>
      )}
    </div>
  )
}
