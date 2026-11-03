import { useEffect, useState } from 'react'
import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr'
import { Bell, CheckCircle2, X } from 'lucide-react'
import { apiRequest } from '../services/api'
import './LiveClinicNotifications.css'

// Push events include IDs only. Patient identity and billing information are
// retrieved separately through the existing role- and tenant-protected API.
type ClinicEvent = {
  kind: 'CheckoutReady' | 'PatientWaiting'
  appointmentId: string
  occurredAtUtc: string
}

type PendingVisit = {
  appointmentId: string
  patientName: string
  status: string
  amountDue?: number
  completedAtUtc?: string | null
  checkedInAtUtc?: string | null
}

type Props = {
  role: string
  onOpen: () => void
}

const money = (amount: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency', currency: 'ZAR',
  }).format(amount)

const time = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString('en-ZA', {
    hour: '2-digit', minute: '2-digit',
  }) : ''

function parseVisit(value: unknown): PendingVisit | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const appointmentId = typeof row.appointmentId === 'string' ? row.appointmentId
    : typeof row.id === 'string' ? row.id : null
  if (!appointmentId || typeof row.patientName !== 'string' ||
      typeof row.status !== 'string') return null
  return {
    appointmentId,
    patientName: row.patientName,
    status: row.status,
    amountDue: typeof row.amountDue === 'number' ? row.amountDue : undefined,
    completedAtUtc: typeof row.completedAtUtc === 'string' ? row.completedAtUtc : null,
    checkedInAtUtc: typeof row.checkedInAtUtc === 'string' ? row.checkedInAtUtc : null,
  }
}

export default function LiveClinicNotifications({ role, onOpen }: Props) {
  const enabled = role === 'Dentist' || role === 'Receptionist' || role === 'PracticeAdmin'
  const isDentist = role === 'Dentist'
  const [rows, setRows] = useState<PendingVisit[]>([])
  const [open, setOpen] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    let loading = false
    let queuedEvent: ClinicEvent | undefined

    const connection = new HubConnectionBuilder()
      .withUrl('/api/hubs/clinic', {
        withCredentials: true,
        // The existing CSRF middleware expects this header on negotiate POST.
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.Warning)
      .build()

    async function sync(event?: ClinicEvent) {
      if (loading) {
        if (event) queuedEvent = event
        return
      }
      loading = true
      try {
        const path = isDentist ? '/appointments/queue' : '/frontdesk/checkout-ready'
        const result = await apiRequest<unknown>(path)
        if (!active) return
        const items = Array.isArray(result)
          ? result.map(parseVisit).filter((item): item is PendingVisit => item !== null)
          : []
        const visible = isDentist
          ? items.filter(item => item.status === 'Waiting' || item.status === 'Called')
          : items.filter(item => item.status === 'AwaitingCheckout')
        setRows(visible)

        if (event) {
          const target = visible.find(item => item.appointmentId === event.appointmentId)
          const notice = event.kind === 'PatientWaiting'
            ? `${target?.patientName ?? 'A patient'} checked in and is waiting for the Dentist.`
            : `${target?.patientName ?? 'A patient'} finished consultation${
                target && typeof target.amountDue === 'number'
                  ? ` · ${money(target.amountDue)} billed` : ''
              }. Ready for checkout.`
          setToast(notice)
        }
      } catch {
        // A transient API failure must not interrupt the active clinic page.
        // The next connection event, focus, or reconciliation retries loading.
      } finally {
        loading = false
        if (queuedEvent && active) {
          const next = queuedEvent
          queuedEvent = undefined
          void sync(next)
        }
      }
    }

    connection.on('ClinicEvent', (event: ClinicEvent) => {
      if (!active) return
      if ((isDentist && event.kind !== 'PatientWaiting') ||
          (!isDentist && event.kind !== 'CheckoutReady')) return
      void sync(event)
      // Refresh Checkout/Queue if those screens are currently mounted.
      window.dispatchEvent(new Event('curvtab:clinic-notification'))
    })
    connection.onreconnecting(() => {
      if (active) setConnectionStatus('offline')
    })
    connection.onreconnected(() => {
      if (active) setConnectionStatus('live')
      void sync()
    })
    connection.onclose(() => {
      if (active) setConnectionStatus('offline')
    })

    async function connect() {
      if (!active || connection.state !== HubConnectionState.Disconnected) return
      try {
        await connection.start()
        if (active) {
          setConnectionStatus('live')
          await sync()
        }
      } catch {
        if (active) setConnectionStatus('offline')
      }
    }

    void connect()
    // Reconcile pending work if a tab slept or the network interrupted an event.
    const pollId = window.setInterval(() => {
      if (connection.state === HubConnectionState.Disconnected) void connect()
      void sync()
    }, 45000)
    const focus = () => { void sync() }
    window.addEventListener('focus', focus)
    return () => {
      active = false
      window.clearInterval(pollId)
      window.removeEventListener('focus', focus)
      void connection.stop()
    }
  }, [enabled, isDentist])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 7500)
    return () => window.clearTimeout(id)
  }, [toast])

  if (!enabled) return null

  return (
    <div className="ct-live-notification-root">
      <button
        type="button"
        className={`ct-live-bell ${open ? 'ct-live-bell-open' : ''}`}
        aria-label={`Notifications: ${rows.length} ${isDentist ? 'patients in queue' : 'awaiting checkout'}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(current => !current)}
      >
        <Bell size={20} aria-hidden="true" />
        {rows.length > 0 && <span className="ct-live-badge">{rows.length > 99 ? '99+' : rows.length}</span>}
      </button>

      {open && (
        <div className="ct-live-menu" role="region" aria-label="Clinic notifications">
          <div className="ct-live-menu-heading">
            <div><strong>Notifications</strong><small>{isDentist ? 'Live patient queue' : 'Awaiting checkout'}</small></div>
            <button type="button" aria-label="Close notifications" onClick={() => setOpen(false)}><X size={18}/></button>
          </div>
          <p className="ct-live-connection">
            <span className={connectionStatus === 'live' ? 'ct-live-dot' : 'ct-offline-dot'} />
            {connectionStatus === 'live' ? 'Live updates connected' : 'Reconnecting — updates also checked automatically'}
          </p>
          <div className="ct-live-items">
            {rows.length === 0 && <p className="ct-live-empty"><CheckCircle2 size={19}/> All caught up</p>}
            {rows.slice(0, 12).map(item => (
              <div className="ct-live-item" key={item.appointmentId}>
                <strong>{item.patientName}</strong>
                <span>{isDentist ? item.status : 'Dentist finished · Awaiting checkout'}</span>
                {!isDentist && typeof item.amountDue === 'number' && <b>{money(item.amountDue)} billed</b>}
                <small>{time(item.completedAtUtc ?? item.checkedInAtUtc)}</small>
              </div>
            ))}
          </div>
          <button type="button" className="ct-live-open" onClick={() => { setOpen(false); onOpen() }}>
            {isDentist ? 'Open Patient Queue' : 'Open Checkout & Payments'}
          </button>
        </div>
      )}

      {toast && (
        <div className="ct-live-toast" role="status" aria-live="polite">
          <span className="ct-live-toast-icon"><Bell size={19}/></span>
          <div><strong>CurvTab Dental · New update</strong><p>{toast}</p></div>
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16}/></button>
        </div>
      )}
    </div>
  )
}
