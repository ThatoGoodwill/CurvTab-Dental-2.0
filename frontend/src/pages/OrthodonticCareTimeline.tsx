import { CalendarDays, ClipboardList, Clock3 } from 'lucide-react'
import './OrthodonticCareTimeline.css'

type ProgressNote = {
  id: string
  visitDate: string
  progressNotes: string
  adjustments: string | null
  nextSteps: string | null
  nextReviewDate: string | null
  recordedAtUtc: string
}

type Props = {
  caseTitle: string
  status: 'Planning' | 'Active' | 'Paused' | 'Completed'
  createdAtUtc: string
  nextReviewDate: string | null
  progressNotes: ProgressNote[]
  loading: boolean
}

const STATUS_ORDER = [
  'Planning',
  'Active',
  'Completed',
] as const

function showDate(value: string | null) {
  if (!value) return 'Not scheduled'
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00`
      : value
  )
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
}

export default function OrthodonticCareTimeline({
  caseTitle,
  status,
  createdAtUtc,
  nextReviewDate,
  progressNotes,
  loading,
}: Props) {
  const stageIndex =
    status === 'Planning' ? 0 :
    status === 'Completed' ? 2 : 1

  const visits = [...progressNotes].sort(
    (a, b) =>
      b.visitDate.localeCompare(a.visitDate) ||
      b.recordedAtUtc.localeCompare(a.recordedAtUtc)
  )

  return (
    <section
      className="ct-ortho-timeline"
      aria-label={`Treatment history for ${caseTitle}`}
    >
      <div className="ct-ortho-timeline-heading">
        <div>
          <h3>Treatment journey</h3>
          <p>{caseTitle}</p>
        </div>
        <span className="ct-ortho-timeline-status">
          {status}
        </span>
      </div>

      <ol className="ct-ortho-stages">
        {STATUS_ORDER.map((stage, index) => (
          <li
            key={stage}
            className={
              index < stageIndex ? 'is-past' :
              index === stageIndex ? 'is-current' : ''
            }
            aria-current={index === stageIndex ? 'step' : undefined}
          >
            <span className="ct-ortho-stage-number">
              {index + 1}
            </span>
            <strong>{stage}</strong>
          </li>
        ))}
      </ol>

      {status === 'Paused' && (
        <p className="ct-ortho-pause">
          This case is currently paused.
        </p>
      )}

      <div className="ct-ortho-timeline-facts">
        <div>
          <Clock3 size={17}/>
          <span>Case opened</span>
          <strong>{showDate(createdAtUtc)}</strong>
        </div>
        <div>
          <ClipboardList size={17}/>
          <span>Recorded visits</span>
          <strong>{loading ? 'Loading…' : visits.length}</strong>
        </div>
        <div>
          <CalendarDays size={17}/>
          <span>Next review</span>
          <strong>{showDate(nextReviewDate)}</strong>
        </div>
      </div>

      <h4>Clinical progress timeline</h4>

      {loading ? (
        <p className="ct-ortho-empty">Loading saved clinical visits…</p>
      ) : visits.length === 0 ? (
        <p className="ct-ortho-empty">
          No progress visits recorded for this case yet.
          Use the existing progress form to add the first clinical entry.
        </p>
      ) : (
        <ol className="ct-ortho-visit-list">
          {visits.map(note => (
            <li key={note.id}>
              <div className="ct-ortho-visit-dot" />
              <article className="ct-ortho-visit-card">
                <header>
                  <strong>{showDate(note.visitDate)}</strong>
                  <small>
                    Recorded {showDate(note.recordedAtUtc)}
                  </small>
                </header>

                <p>{note.progressNotes}</p>

                {note.adjustments && (
                  <div>
                    <span>Adjustments</span>
                    <p>{note.adjustments}</p>
                  </div>
                )}

                {note.nextSteps && (
                  <div>
                    <span>Next steps</span>
                    <p>{note.nextSteps}</p>
                  </div>
                )}

                {note.nextReviewDate && (
                  <small>
                    Review planned: {showDate(note.nextReviewDate)}
                  </small>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}

      <p className="ct-ortho-timeline-note">
        The journey shows the saved case status and visit history.
        Stages do not represent automated clinical assessments.
      </p>
    </section>
  )
}
