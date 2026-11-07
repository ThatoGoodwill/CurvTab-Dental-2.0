import { useEffect, useState } from 'react'
import { Activity, RefreshCw } from 'lucide-react'
import { apiRequest } from '../services/api'

type PracticeStatus = {
  practiceId: string
  practiceName: string
  manualAccessActive: boolean
  subscriptionStatus: string
  renewalDateUtc: string | null
  graceEndsUtc: string | null
}

type HealthResponse = {
  checkedAtUtc: string
  automaticEnforcementEnabled: boolean
  practices: PracticeStatus[]
}

const labels: Record<string, string> = {
  NotConfigured: 'Not configured',
  Pending: 'Awaiting verified payment',
  Scheduled: 'Scheduled',
  Active: 'Active',
  GracePeriod: 'Grace period',
  Overdue: 'Overdue',
}

function dateLabel(date: string | null) {
  return date
    ? new Date(date).toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : '—'
}

export default function PlatformSubscriptionHealthPanel() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true

    apiRequest<HealthResponse>('/platform/subscription-health')
      .then(result => {
        if (!active) return
        setData(result)
        setError('')
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error
          ? cause.message : 'Unable to load subscription status.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [reload])

  return (
    <section className="ct-subscriptions-panel">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Activity size={20} />
            Subscription Health
          </h2>
          <p style={{ fontSize: 13, opacity: .75 }}>
            Current subscription status calculated by the server.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setLoading(true)
            setReload(value => value + 1)
          }}
        >
          <RefreshCw size={16} /> Check Status
        </button>
      </div>

      {loading && <p>Checking subscription status...</p>}
      {error && <p role="alert">{error}</p>}

      {data && !loading && (
        <>
          <p style={{ fontSize: 12, opacity: .7 }}>
            Automatic account restrictions:
            {' '}
            <strong>
              {data.automaticEnforcementEnabled
                ? 'Enabled'
                : 'Not enabled yet'}
            </strong>
          </p>

          <div className="ct-subscriptions-practices">
            {data.practices.map(practice => (
              <div key={practice.practiceId} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                padding: 15,
                borderRadius: 11,
                border: '1px solid var(--ct-line, #dce7f1)',
              }}>
                <div style={{ display: 'grid', gap: 5 }}>
                  <strong>{practice.practiceName}</strong>
                  <small style={{ opacity: .75 }}>
                    Renewal: {dateLabel(practice.renewalDateUtc)}
                  </small>
                </div>

                <div style={{ display: 'grid', gap: 5, textAlign: 'right' }}>
                  <strong>
                    {labels[practice.subscriptionStatus]
                      ?? practice.subscriptionStatus}
                  </strong>
                  <small style={{ opacity: .75 }}>
                    Manual access:
                    {' '}
                    {practice.manualAccessActive
                      ? 'Active'
                      : 'Suspended'}
                  </small>
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, opacity: .7 }}>
            Status is recalculated whenever this panel loads or
            Check Status is selected. Existing practice access
            is not changed by this monitor.
          </p>
        </>
      )}
    </section>
  )
}
