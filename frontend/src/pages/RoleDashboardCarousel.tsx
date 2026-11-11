import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import './RoleOperationsDashboard.css'

type Slide = { title: string; content: ReactNode }
type Props = {
  eyebrow: string
  slides: Slide[]
  loading?: boolean
  onRefresh?: () => void
}

/** Reusable dashboard report surface. Only authorized, role-specific content is
 * supplied by each caller. Never automatically advances while hovered/focused. */
export default function RoleDashboardCarousel({ eyebrow, slides, loading, onRefresh }: Props) {
  const [selected, setSelected] = useState(0)
  const [paused, setPaused] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const count = slides.length

  useEffect(() => {
    if (count <= 1 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setSelected(i => (i + 1) % count), 6000)
    return () => window.clearInterval(timer)
  }, [count, paused])

  if (count === 0) return null
  const index = selected % count
  const next = (direction: number) => setSelected(i => (i + direction + count) % count)

  return <section className="ct-role-carousel" aria-label={eyebrow}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    onFocusCapture={() => setPaused(true)}
    onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false)
    }}>
    <header className="ct-role-carousel-heading">
      <div><span className="ct-role-eyebrow">{eyebrow}</span>
        <h2>{slides[index].title}</h2></div>
      <div className="ct-role-carousel-controls">
        {count > 1 && <>
          <button type="button" aria-label="Previous report" onClick={() => next(-1)}><ChevronLeft size={16}/></button>
          <span aria-label={`Report ${index + 1} of ${count}`}>{index + 1} / {count}</span>
          <button type="button" aria-label="Next report" onClick={() => next(1)}><ChevronRight size={16}/></button>
        </>}
        {onRefresh && <button type="button" disabled={loading} onClick={onRefresh}>
          <RefreshCw size={14}/> Refresh</button>}
      </div>
    </header>
    <nav className="ct-role-carousel-tabs" aria-label="Report sections">
      {slides.map((slide, i) => <button key={slide.title} type="button"
        className={index === i ? 'active' : ''} aria-pressed={index === i}
        onClick={() => setSelected(i)}>{slide.title}</button>)}
    </nav>
    <div key={index} className="ct-role-carousel-body" tabIndex={0}
      onTouchStart={event => setTouchStart(event.touches[0]?.clientX ?? null)}
      onTouchEnd={event => {
        if (touchStart === null) return
        const diff = event.changedTouches[0]?.clientX - touchStart
        if (Math.abs(diff) > 65) next(diff < 0 ? 1 : -1)
        setTouchStart(null)
      }}>
      {slides[index].content}
    </div>
  </section>
}
