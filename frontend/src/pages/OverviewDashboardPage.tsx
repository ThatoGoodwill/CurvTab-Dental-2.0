import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { apiRequest } from '../services/api'
import { Donut, LineChart } from '../components/charts'
import './OverviewDashboard.css'

// =========================================================
// OVERVIEW DASHBOARD (PracticeAdmin and Receptionist)
// Every figure comes from the existing API:
//   GET /appointments        -> calendar, today, status, monthly trend
//   GET /patients            -> number of patients
//   GET /frontdesk/checkout-ready -> patients waiting to pay
// =========================================================

export type OverviewAppointment = {
  id: string
  patientName: string
  startUtc: string
  endUtc: string
  status: string
  reason: string | null
}

type CheckoutReady = {
  appointmentId: string
  amountDue: number
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STATUS: Record<string, { label: string; color: string; tone: string }> = {
  Scheduled: { label: 'Scheduled', color: '#2f6bff', tone: 'blue' },
  Waiting: { label: 'Waiting', color: '#f59e0b', tone: 'amber' },
  Called: { label: 'Called', color: '#8b5cf6', tone: 'purple' },
  InConsultation: { label: 'In consultation', color: '#22c55e', tone: 'green' },
  AwaitingCheckout: { label: 'Awaiting checkout', color: '#fb923c', tone: 'orange' },
  CheckedOut: { label: 'Checked out', color: '#94a3b8', tone: 'slate' },
}

const statusMeta = (status: string) =>
  STATUS[status] ?? { label: status, color: '#cbd5e1', tone: 'slate' }

const pad = (value: number) => String(value).padStart(2, '0')
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const timeOf = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/** The API sends UTC; add the Z when it is missing so the browser converts to local time. */
function parseUtc(value: string): Date {
  return new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`)
}

type Dated = OverviewAppointment & { start: Date; end: Date }

// ---------------------------------------------------------
// Presentation (receives data, draws the dashboard)
// ---------------------------------------------------------

type ViewProps = {
  fullName: string
  practiceName: string | null
  now: Date
  appointments: OverviewAppointment[]
  patientTotal: number | null
  awaitingCount: number | null
  awaitingAmount: number | null
  loading: boolean
  error: string
  onRefresh: () => void
  onNewAppointment: () => void
  onOpenQueue: () => void
  onOpenCheckout: () => void
  onOpenPatients: () => void
}

export function OverviewDashboardView(props: ViewProps) {
  const { now } = props
  const [cursor, setCursor] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }))
  const [selectedKey, setSelectedKey] = useState(() => dayKey(now))
  const [panel, setPanel] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStart = useRef<number | null>(null)
  const panelNames = ['Appointments Calendar', 'Status & Overview', 'Monthly Trends'] as const
  const navigatePanel = (offset: number) => setPanel(index => (index + offset + panelNames.length) % panelNames.length)
  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      setPanel(index => (index + 1) % panelNames.length)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [paused, panelNames.length])
  const finishSwipe = (clientX: number) => {
    if (touchStart.current !== null) {
      const delta = clientX - touchStart.current
      if (Math.abs(delta) > 64) navigatePanel(delta < 0 ? 1 : -1)
      touchStart.current = null
    }
  }

  const dated: Dated[] = useMemo(
    () =>
      props.appointments
        .map((item) => ({ ...item, start: parseUtc(item.startUtc), end: parseUtc(item.endUtc) }))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [props.appointments],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, Dated[]>()
    for (const item of dated) {
      const key = dayKey(item.start)
      map.set(key, [...(map.get(key) ?? []), item])
    }
    return map
  }, [dated])

  const todayKey = dayKey(now)
  const today = byDay.get(todayKey) ?? []
  const countToday = (status: string) => today.filter((item) => item.status === status).length

  // Current-month appointments by status (donut).
  const monthItems = dated.filter(
    (item) => item.start.getFullYear() === now.getFullYear() && item.start.getMonth() === now.getMonth(),
  )
  const slices = Object.keys(STATUS)
    .map((status) => ({
      label: STATUS[status].label,
      color: STATUS[status].color,
      value: monthItems.filter((item) => item.status === status).length,
    }))
    .filter((slice) => slice.value > 0)
  const otherCount = monthItems.filter((item) => !(item.status in STATUS)).length
  if (otherCount > 0) slices.push({ label: 'Other', color: '#cbd5e1', value: otherCount })

  // Last six months (trend).
  const trendLabels: string[] = []
  const trendValues: number[] = []
  for (let back = 5; back >= 0; back--) {
    const month = new Date(now.getFullYear(), now.getMonth() - back, 1)
    trendLabels.push(MONTHS[month.getMonth()].slice(0, 3))
    trendValues.push(
      dated.filter(
        (item) => item.start.getFullYear() === month.getFullYear() && item.start.getMonth() === month.getMonth(),
      ).length,
    )
  }

  // Calendar.
  const monthIndex = cursor.y * 12 + cursor.m
  const nowIndex = now.getFullYear() * 12 + now.getMonth()
  const canGoBack = monthIndex > nowIndex - 5
  const canGoForward = monthIndex < nowIndex + 1

  function shiftMonth(delta: number) {
    const next = new Date(cursor.y, cursor.m + delta, 1)
    setCursor({ y: next.getFullYear(), m: next.getMonth() })
    const sameAsNow = next.getFullYear() === now.getFullYear() && next.getMonth() === now.getMonth()
    setSelectedKey(dayKey(sameAsNow ? now : next))
  }

  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay()
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: (number | null)[] = Array<number | null>(firstWeekday).fill(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)

  const [selY, selM, selD] = selectedKey.split('-').map(Number)
  const selectedDate = new Date(selY, selM - 1, selD)
  const selectedItems = byDay.get(selectedKey) ?? []

  const queueCount = countToday('Waiting') + countToday('Called')
  const statusTiles = [
    { label: 'Scheduled', value: countToday('Scheduled'), tone: 'green' },
    { label: 'In Queue', value: queueCount, tone: 'amber' },
    { label: 'In Consultation', value: countToday('InConsultation'), tone: 'blue' },
    { label: 'Awaiting Checkout', value: countToday('AwaitingCheckout'), tone: 'orange' },
    { label: 'Checked Out', value: countToday('CheckedOut'), tone: 'slate' },
  ]

  const placeholder = props.loading && props.appointments.length === 0

  return (
    <div className="ov"
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
      }}>
      <div className="ov-carousel-heading"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}>
        <div className="ov-carousel-heading-copy">
          <span className="ov-carousel-eyebrow">PRACTICE OPERATIONS · LIVE DATA</span>
          <h2>{panelNames[panel]}</h2>
          <p>Live practice reports, smoothly changing every 2 seconds. Hover or focus to pause.</p>
        </div>
        <div className="ov-carousel-controls" role="group" aria-label="Dashboard report slides">
          <button type="button" className="ov-carousel-arrow" aria-label="Previous report"
            onClick={() => navigatePanel(-1)}><ChevronLeft size={19}/></button>
          <span className="ov-carousel-count" aria-live="polite">{panel + 1} / {panelNames.length}</span>
          <button type="button" className="ov-carousel-arrow" aria-label="Next report"
            onClick={() => navigatePanel(1)}><ChevronRight size={19}/></button>
          <button type="button" className="secondary-button" onClick={props.onRefresh}
            disabled={props.loading}><RefreshCw size={14}/> Refresh</button>
        </div>
      </div>
      <div className="ov-carousel-tabs" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} role="group" aria-label="Choose report">
        {panelNames.map((name, index) => (
          <button type="button" key={name}
            aria-pressed={panel === index}
            className={panel === index ? 'ov-carousel-tab active' : 'ov-carousel-tab'}
            onClick={() => setPanel(index)}>{name}</button>
        ))}
      </div>

      {props.error && (
        <div className="ov-alert" role="alert">
          {props.error}
        </div>
      )}

      <div key={panel} className={`ct-live-report ct-live-report-${panel}`}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null }}
        onTouchEnd={event => finishSwipe(event.changedTouches[0]?.clientX ?? 0)}
        onKeyDown={event => {
          if (event.target !== event.currentTarget) return
          if (event.key === 'ArrowRight') navigatePanel(1)
          if (event.key === 'ArrowLeft') navigatePanel(-1)
        }}
        tabIndex={0} aria-label={`Dashboard report: ${panelNames[panel]}`}>
        {panel === 0 && <section className="ov-card ov-calendar">
          <div className="ov-card-head">
            <h3>Appointments Calendar</h3>
            <div className="ov-month-switch">
              <button type="button" onClick={() => shiftMonth(-1)} disabled={!canGoBack} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <span>
                {MONTHS[cursor.m].slice(0, 3)} {cursor.y}
              </span>
              <button type="button" onClick={() => shiftMonth(1)} disabled={!canGoForward} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
            <button type="button" className="ov-btn ov-btn-primary" onClick={props.onNewAppointment}>
              + New Appointment
            </button>
          </div>

          <div className="ov-calendar-body">
            <div className="ov-cal-grid">
              {WEEKDAYS.map((name, index) => (
                <div key={name} className={'ov-cal-dow' + (index === 0 ? ' sun' : '')}>
                  {name}
                </div>
              ))}
              {cells.map((day, index) => {
                if (day === null) return <div key={`e${index}`} className="ov-cal-cell empty" />
                const key = `${cursor.y}-${pad(cursor.m + 1)}-${pad(day)}`
                const items = byDay.get(key) ?? []
                const classes = [
                  'ov-cal-cell',
                  index % 7 === 0 ? 'sun' : '',
                  key === selectedKey ? 'selected' : '',
                  key === todayKey ? 'today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <button key={key} type="button" className={classes} onClick={() => setSelectedKey(key)}>
                    <span>{day}</span>
                    {items.length > 0 && (
                      <i className="ov-dots">
                        {items.slice(0, 3).map((item) => (
                          <b key={item.id} style={{ background: statusMeta(item.status).color }} />
                        ))}
                      </i>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="ov-day-list">
              <div className="ov-day-title">
                {WEEKDAYS[selectedDate.getDay()]}, {selD} {MONTHS[selM - 1].slice(0, 3)} {selY}
                <span>
                  {' '}
                  ({selectedItems.length} Appointment{selectedItems.length === 1 ? '' : 's'})
                </span>
              </div>
              {selectedItems.length === 0 && <div className="ov-empty">No appointments on this day.</div>}
              {selectedItems.map((item) => {
                const meta = statusMeta(item.status)
                return (
                  <div key={item.id} className={`ov-appt ${meta.tone}`}>
                    <div className="ov-appt-main">
                      <strong>
                        {timeOf(item.start)} – {timeOf(item.end)}
                      </strong>
                      <span>{item.patientName}</span>
                      {item.reason && <small>{item.reason}</small>}
                    </div>
                    <span className={`ov-chip ${meta.tone}`}>{meta.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>}

        {panel === 1 && <section className="ov-card ov-overview">
          <div className="ov-card-head">
            <h3>Practice Overview</h3>
            <span className="ov-select">{MONTHS[now.getMonth()]}</span>
          </div>
          {monthItems.length === 0 ? (
            <div className="ov-empty">No appointments this month yet.</div>
          ) : (
            <div className="ov-overview-body">
              <Donut slices={slices} centerValue={String(monthItems.length)} centerLabel="Appointments" />
              <ul className="ov-legend">
                {slices.map((slice) => (
                  <li key={slice.label}>
                    <i style={{ background: slice.color }} />
                    <span>{slice.label}</span>
                    <b>{Math.round((slice.value / monthItems.length) * 100)}%</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>}
        {panel === 1 && <section className="ov-card ov-status">
          <h3>
            Appointments Status <small>(Today)</small>
          </h3>
          <div className="ov-status-grid">
            {statusTiles.map((tile) => (
              <div key={tile.label} className={`ov-status-tile ${tile.tone}`}>
                <div className="ov-status-label">{tile.label}</div>
                <div className="ov-status-value">{placeholder ? '…' : tile.value}</div>
              </div>
            ))}
          </div>
        </section>}

        {panel === 2 && <section className="ov-card ov-trends">
          <div className="ov-card-head">
            <h3>Monthly Trends</h3>
            <span className="ov-select">Last 6 months</span>
          </div>
          <LineChart labels={trendLabels} values={trendValues} />
        </section>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------
// Data loading
// ---------------------------------------------------------

type Props = {
  fullName: string
  practiceName: string | null
  onNewAppointment: () => void
  onOpenQueue: () => void
  onOpenCheckout: () => void
  onOpenPatients: () => void
}

const DAY_MS = 24 * 60 * 60 * 1000

export default function OverviewDashboardPage(props: Props) {
  const [now, setNow] = useState(() => new Date())
  const [appointments, setAppointments] = useState<OverviewAppointment[]>([])
  const [patientTotal, setPatientTotal] = useState<number | null>(null)
  const [awaiting, setAwaiting] = useState<CheckoutReady[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    const current = new Date()

    // The appointments endpoint accepts at most 93 days, so ask in windows of 90 days.
    const from = new Date(current.getFullYear(), current.getMonth() - 5, 1)
    const to = new Date(current.getFullYear(), current.getMonth() + 2, 1)
    const windows: Array<[Date, Date]> = []
    let start = from
    while (start < to) {
      const end = new Date(Math.min(start.getTime() + 90 * DAY_MS, to.getTime()))
      windows.push([start, end])
      start = end
    }

    Promise.allSettled([
      Promise.all(
        windows.map(([a, b]) =>
          apiRequest<OverviewAppointment[]>(
            `/appointments?fromUtc=${encodeURIComponent(a.toISOString())}&toUtc=${encodeURIComponent(b.toISOString())}`,
          ),
        ),
      ),
      apiRequest<{ total: number }>('/patients?pageSize=1'),
      apiRequest<CheckoutReady[]>('/frontdesk/checkout-ready'),
    ]).then(([appointmentResult, patientResult, checkoutResult]) => {
      if (cancelled) return
      setNow(current)

      if (appointmentResult.status === 'fulfilled') {
        const unique = new Map<string, OverviewAppointment>()
        for (const chunk of appointmentResult.value) for (const item of chunk) unique.set(item.id, item)
        setAppointments([...unique.values()])
        setError('')
      } else {
        const reason: unknown = appointmentResult.reason
        setError(reason instanceof Error ? reason.message : 'Appointments are unavailable.')
      }

      setPatientTotal(patientResult.status === 'fulfilled' ? patientResult.value.total : null)
      setAwaiting(checkoutResult.status === 'fulfilled' ? checkoutResult.value : null)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [reload])

  return (
    <OverviewDashboardView
      {...props}
      now={now}
      appointments={appointments}
      patientTotal={patientTotal}
      awaitingCount={awaiting === null ? null : awaiting.length}
      awaitingAmount={awaiting === null ? null : awaiting.reduce((sum, row) => sum + row.amountDue, 0)}
      loading={loading}
      error={error}
      onRefresh={() => {
        setLoading(true)
        setReload((value) => value + 1)
      }}
    />
  )
}
