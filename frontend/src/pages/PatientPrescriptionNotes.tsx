
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiRequest } from '../services/api'

type PrescriptionNote = {
  id: string
  notes: string
  date: string | null
}

type Props = {
  patientId: string
}

function extractNotes(
  response: unknown,
  patientId: string
): PrescriptionNote[] {
  const payload =
    Array.isArray(response)
      ? response
      : response &&
          typeof response === 'object' &&
          !Array.isArray(response)
        ? (
            (response as Record<string, unknown>).items ??
            (response as Record<string, unknown>).consultations ??
            (response as Record<string, unknown>).rows
          )
        : null

  if (!Array.isArray(payload)) {
    throw new Error(
      'Unable to read the consultation history response.'
    )
  }

  const notes: PrescriptionNote[] = []

  for (const value of payload) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      continue
    }

    const row = value as Record<string, unknown>

    if (
      typeof row.patientId === 'string' &&
      row.patientId.toLowerCase() !== patientId.toLowerCase()
    ) {
      throw new Error('Consultation patient mismatch.')
    }

    const text =
      typeof row.prescriptionNotes === 'string'
        ? row.prescriptionNotes.trim()
        : ''

    if (!text) continue

    notes.push({
      id: typeof row.id === 'string'
        ? row.id
        : `note-${notes.length}`,
      notes: text,
      date:
        typeof row.updatedAtUtc === 'string'
          ? row.updatedAtUtc
          : typeof row.createdAtUtc === 'string'
            ? row.createdAtUtc
            : null
    })
  }

  return notes
}

export default function PatientPrescriptionNotes({
  patientId
}: Props) {
  const [notes, setNotes] = useState<PrescriptionNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setNotes([])

    apiRequest<unknown>(
      `/dentist/patients/${encodeURIComponent(patientId)}/consultations`
    )
      .then(response => {
        const result = extractNotes(response, patientId)
        if (active) setNotes(result)
      })
      .catch(cause => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load prescription notes.'
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [patientId])

  const panelStyle: CSSProperties = {
    padding: '12px',
    border: '1px solid var(--border)',
    borderRadius: '9px',
    background: 'var(--surface-soft)',
    color: 'var(--text)',
    marginBottom: '9px'
  }

  return (
    <section
      aria-label="Patient prescriptions"
      style={{ padding: '8px 0', color: 'var(--text)' }}
    >
      <h2 style={{ fontSize: 16, marginBottom: 6 }}>
        Prescriptions
      </h2>

      <p style={{
        fontSize: 11,
        color: 'var(--muted)',
        marginBottom: 12
      }}>
        Prescription notes documented during clinical
        consultations for this patient.
      </p>

      {loading && (
        <p role="status">Loading consultation records…</p>
      )}

      {error && (
        <p role="alert" style={panelStyle}>{error}</p>
      )}

      {!loading && !error && notes.length === 0 && (
        <div style={panelStyle}>
          No consultation prescription notes found.
        </div>
      )}

      {!loading && !error && notes.map(note => (
        <article key={note.id} style={panelStyle}>
          {note.date && (
            <small style={{
              display: 'block',
              color: 'var(--muted)',
              marginBottom: 7
            }}>
              {new Date(note.date).toLocaleDateString('en-ZA')}
            </small>
          )}

          <p style={{
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            fontSize: 12,
            margin: 0
          }}>
            {note.notes}
          </p>
        </article>
      ))}

      <p style={{
        color: 'var(--muted)',
        fontSize: 10,
        lineHeight: 1.5,
        marginTop: 12
      }}>
        Consultation notes only. This section does not
        issue, authorise or print medication prescriptions.
      </p>
    </section>
  )
}
