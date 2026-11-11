import ClientDashboardKpis from './ClientDashboardKpis'
import { useEffect, useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { apiRequest } from '../services/api'
import '../CurvTabCalendarHover.css'
import './ClinicDashboardEnhancements.css'

type Props = {
  role: string
  practiceName?: string | null
  onPrimaryAction: () => void
  showActivityCharts?: boolean
  showKpis?: boolean
}

type AppointmentSnapshot = {
  startUtc: string
  status: string
}

type PracticeSnapshot = {
  isActive: boolean
}

type WindowChoice = '7 days' | '30 days'

const slides = [
  {
    eyebrow: 'CURVTAB DENTAL · DAILY CARE',
    title: 'Healthy smiles, better every day.',
    description: 'A connected practice, from the first appointment to confident smiles.',
    image: '/dental-ui/tooth-fresh.svg',
    imageAlt: 'Clean illustration of a healthy tooth',
    variant: 'fresh',
  },
  {
    eyebrow: 'CONFIDENCE STARTS WITH CARE',
    title: 'Fresh smiles start here.',
    description: 'Keep your patients, appointments and team organised in one workspace.',
    image: '/dental-ui/tooth-fresh.svg',
    imageAlt: 'Illustration of a healthy smiling tooth and sparkles',
    variant: 'fresh',
  },
  {
    eyebrow: 'PERSONALISED DENTAL CARE',
    title: 'Every smile has a story.',
    description: 'Simple clinical workflows and a clearer view of daily progress.',
    image: '/dental-ui/tooth-care.svg',
    imageAlt: 'Illustration of an orthodontic tooth with a brace',
    variant: 'care',
  },
] as const

const statusGroups = [
  { name: 'Scheduled', statuses: ['Scheduled'], color: '#3B82F6' },
  { name: 'In progress', statuses: ['Waiting', 'Called', 'InConsultation'], color: '#16B8A7' },
  { name: 'Checkout', statuses: ['AwaitingCheckout'], color: '#F59E0B' },
  { name: 'Checked out', statuses: ['CheckedOut'], color: '#8B5CF6' },
  { name: 'Other', statuses: ['Cancelled', 'NoShow'], color: '#94A3B8' },
]

function localKey(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function windowRange(days: number) {
  const to = new Date()
  to.setHours(0, 0, 0, 0)
  to.setDate(to.getDate() + 1)
  const from = new Date(to)
  from.setDate(from.getDate() - days)
  return { from, to }
}

function parseAppointments(input: unknown): AppointmentSnapshot[] {
  if (!Array.isArray(input)) throw new Error('Unexpected appointment data.')
  return input.filter((item: unknown): item is AppointmentSnapshot => {
    if (typeof item !== 'object' || item === null) return false
    const row = item as Record<string, unknown>
    return typeof row.startUtc === 'string' && typeof row.status === 'string'
  })
}

function parsePractices(input: unknown): PracticeSnapshot[] {
  if (!Array.isArray(input)) throw new Error('Unexpected practice data.')
  return input.filter((item: unknown): item is PracticeSnapshot =>
    typeof item === 'object' && item !== null &&
    typeof (item as Record<string, unknown>).isActive === 'boolean'
  )
}


type EditablePracticeSlide = {
  id: string
  eyebrow: string
  title: string
  description: string
  image: string
  imageAlt: string
}

function DentalSlideshow({ role, onPrimaryAction }: Pick<Props, 'role' | 'onPrimaryAction'>) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const [practiceSlides, setPracticeSlides] =
    useState<EditablePracticeSlide[] | null>(null)

  useEffect(() => {
    if (role === 'SuperAdmin') return

    let active = true

    apiRequest<EditablePracticeSlide[]>('/practice/slides')
      .then(value => {
        if (active && Array.isArray(value) && value.length > 0) {
          setPracticeSlides(value)
        }
      })
      .catch(() => {
        // Show built-in slides if the configuration is unavailable.
      })

    return () => { active = false }
  }, [role])

  const activeSlides = (
    role === 'SuperAdmin' ? slides : practiceSlides ?? slides
  ).map(item => item.image.includes('smile-hero.webp')
    ? { ...item, image: '/dental-ui/tooth-fresh.svg', imageAlt: 'Clean illustration of a healthy tooth' }
    : item)

  const slideIndex = current % activeSlides.length
  const slide = activeSlides[slideIndex]
  const variant = 'variant' in slide ? slide.variant : 'smile'

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const interval = window.setInterval(() => {
      setCurrent((index) => (index + 1) % activeSlides.length)
    }, 6500)
    return () => window.clearInterval(interval)
  }, [paused, activeSlides.length])

  return (
    <section
      className={`ct-hero ct-hero-${variant}`}
      aria-roledescription="carousel"
      aria-label="Practice dashboard highlights"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
      }}
    >
      <div className="ct-hero-copy" key={`text-${current}`}>
        <span className="ct-hero-eyebrow"><Sparkles size={15} /> {slide.eyebrow}</span>
        <h2>{slide.title}</h2>
        <p>{slide.description}</p>
        <button type="button" className="ct-hero-action" onClick={onPrimaryAction}>
          <CalendarDays size={17} />
          {role === 'SuperAdmin' ? 'Manage practices' : 'Open appointments'}
        </button>
      </div>
      <div className="ct-hero-art" key={`image-${current}`}>
        <img src={slide.image} alt={slide.imageAlt} loading="eager" />
      </div>
      <div className="ct-hero-controls" aria-label="Slideshow navigation">
        <button type="button" aria-label="Previous slide"
          onClick={() => setCurrent((current + activeSlides.length - 1) % activeSlides.length)}>
          <ChevronLeft size={18} />
        </button>
        <div className="ct-slide-dots">
          {activeSlides.map((item, index) => (
            <button key={'id' in item ? item.id : item.variant} type="button"
              className={index === slideIndex ? 'ct-dot-active' : ''}
              aria-label={`Show slide ${index + 1}`}
              aria-current={index === slideIndex ? 'true' : undefined}
              onClick={() => setCurrent(index)} />
          ))}
        </div>
        <button type="button" aria-label="Next slide"
          onClick={() => setCurrent((current + 1) % activeSlides.length)}>
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  )
}

function PracticeActivityCharts({ role }: Pick<Props, 'role'>) {
  const [period, setPeriod] = useState<WindowChoice>('7 days')
  const [appointments, setAppointments] = useState<AppointmentSnapshot[]>([])
  const [practices, setPractices] = useState<PracticeSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    const days = period === '7 days' ? 7 : 30
    const { from, to } = windowRange(days)
    const request = role === 'SuperAdmin'
      ? apiRequest<unknown>('/platform/practices').then((value) => ({ practices: parsePractices(value) }))
      : apiRequest<unknown>(`/appointments?fromUtc=${encodeURIComponent(from.toISOString())}&toUtc=${encodeURIComponent(to.toISOString())}`)
          .then((value) => ({ appointments: parseAppointments(value) }))
    request.then((result) => {
      if (cancelled) return
      if ('practices' in result) setPractices(result.practices)
      if ('appointments' in result) setAppointments(result.appointments)
      setError('')
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load activity.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [role, period, reload])

  const days = period === '7 days' ? 7 : 30
  const { from } = windowRange(days)
  const counts = Array.from({ length: days }, (_, index) => {
    const day = new Date(from)
    day.setDate(from.getDate() + index)
    return {
      key: localKey(day),
      label: day.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }),
      count: appointments.filter((appt) => localKey(new Date(appt.startUtc)) === localKey(day)).length,
    }
  })
  const buckets = period === '7 days'
    ? counts
    : Array.from({ length: 6 }, (_, index) => ({
        key: `b${index}`,
        label: `${counts[index * 5].label}`,
        count: counts.slice(index * 5, index * 5 + 5).reduce((n, day) => n + day.count, 0),
      }))
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.count))
  const total = appointments.length
  const statuses = statusGroups.map((group) => ({
    ...group,
    count: appointments.filter((row) => group.statuses.includes(row.status)).length,
  }))
  const overall = statuses.reduce((sum, row) => sum + row.count, 0)
  let gradientAt = 0
  const gradient = overall === 0 ? '#E4EBF3' : `conic-gradient(${statuses.map((row) => {
    const start = gradientAt
    gradientAt += (row.count / overall) * 100
    return `${row.color} ${start}% ${gradientAt}%`
  }).join(',')})`

  const activePractices = practices.filter((practice) => practice.isActive).length
  const inactivePractices = practices.length - activePractices
  const platformGradient = practices.length === 0
    ? '#E4EBF3'
    : `conic-gradient(#16B8A7 0 ${(activePractices / practices.length) * 100}%, #94A3B8 ${(activePractices / practices.length) * 100}% 100%)`

  return (
    <section className="ct-analytics" aria-label="Practice activity analytics">
      <div className="ct-analytics-heading">
        <div>
          <div className="ct-analytics-kicker"><TrendingUp size={16} /> LIVE WORKSPACE ANALYTICS</div>
          <h2>{role === 'SuperAdmin' ? 'Platform overview' : 'Appointment overview'}</h2>
          <p>{role === 'SuperAdmin' ? 'Current practice registration status.' : 'Based on saved appointments in your practice.'}</p>
        </div>
        <div className="ct-analytics-actions">
          {role !== 'SuperAdmin' && (
            <div className="ct-period" role="group" aria-label="Reporting period">
              {(['7 days', '30 days'] as const).map((item) => (
                <button type="button" key={item} aria-pressed={period === item}
                  className={period === item ? 'ct-period-active' : ''}
                  onClick={() => { setLoading(true); setPeriod(item) }}>
                  {item}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="ct-refresh" aria-label="Refresh dashboard data"
            onClick={() => { setLoading(true); setReload((count) => count + 1) }} disabled={loading}>
            <RefreshCw size={17} />
          </button>
        </div>
      </div>
      {error && <p role="alert" className="ct-analytics-error">{error}</p>}
      <div className="ct-chart-grid">
        {role === 'SuperAdmin' ? (
          <>
            <article className="ct-chart-card">
              <h3>Registered practices</h3>
              <div className="ct-chart-number">{loading || error ? '—' : practices.length}</div>
              <div className="ct-platform-bars">
                <div><span>Active</span><strong>{loading || error ? '—' : activePractices}</strong>
                  <div><span style={{ width: `${practices.length ? (activePractices / practices.length) * 100 : 0}%`, background: '#16B8A7' }} /></div></div>
                <div><span>Inactive</span><strong>{loading || error ? '—' : inactivePractices}</strong>
                  <div><span style={{ width: `${practices.length ? (inactivePractices / practices.length) * 100 : 0}%`, background: '#94A3B8' }} /></div></div>
              </div>
            </article>
            <article className="ct-chart-card ct-donut-card">
              <h3>Practice status</h3>
              <div className="ct-donut-wrap">
                <div className="ct-donut" style={{ background: platformGradient }}>
                  <div><strong>{loading || error ? '—' : practices.length}</strong><span>Practices</span></div>
                </div>
                <div className="ct-legend">
                  <div><i style={{ background: '#16B8A7' }}/>Active<strong>{loading || error ? '—' : activePractices}</strong></div>
                  <div><i style={{ background: '#94A3B8' }}/>Inactive<strong>{loading || error ? '—' : inactivePractices}</strong></div>
                </div>
              </div>
            </article>
          </>
        ) : (
          <>
            <article className="ct-chart-card">
              <div className="ct-chart-title-row">
                <div><h3>Appointment activity</h3><p>Visits scheduled by date</p></div>
                <div className="ct-chart-number">{loading || error ? '—' : total}</div>
              </div>
              <div className="ct-bars" role="img" aria-label={`Appointments by day for the last ${days} days`}>
                {buckets.map((bucket) => (
                  <div className="ct-bar-item" key={bucket.key} title={`${bucket.label}: ${bucket.count} appointment(s)`}>
                    <span className="ct-bar-value">{bucket.count}</span>
                    <div className="ct-bar-track"><div className="ct-bar-fill"
                      style={{ height: `${bucket.count === 0 ? 3 : Math.max(10, (bucket.count / peak) * 100)}%` }} /></div>
                    <span className="ct-bar-label">{bucket.label}</span>
                  </div>
                ))}
              </div>
              <p className="ct-chart-footnote">{total === 0 && !loading && !error ? 'No appointments in this period yet.' : 'Figures reflect current saved appointments (up to 500 returned by the API).'}</p>
            </article>
            <article className="ct-chart-card ct-donut-card">
              <h3>Current appointment statuses</h3>
              <div className="ct-donut-wrap">
                <div className="ct-donut" style={{ background: gradient }}>
                  <div><strong>{loading || error ? '—' : total}</strong><span>Appointments</span></div>
                </div>
                <div className="ct-legend">
                  {statuses.map((row) => (
                    <div key={row.name}><i style={{ background: row.color }}/>{row.name}
                      <strong>{loading || error ? '—' : row.count}</strong></div>
                  ))}
                </div>
              </div>
            </article>
          </>
        )}
      </div>
    </section>
  )
}

export default function ClinicDashboardEnhancements({ role, onPrimaryAction, showActivityCharts = true, showKpis = true }: Props) {
  return (
    <div className="ct-dashboard-enhancements">
      <DentalSlideshow role={role} onPrimaryAction={onPrimaryAction} />
      {showKpis && <ClientDashboardKpis role={role} onPrimaryAction={onPrimaryAction} />}
      {showActivityCharts && <PracticeActivityCharts role={role} />}
    </div>
  )
}
