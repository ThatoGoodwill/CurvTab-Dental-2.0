
// CT_COMPACT_LOCATION_MENU_V6
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  kind: 'city' | 'suburb'
  value: string
  choices: string[]
  suggestions: string[]
  onChange: (value: string) => void
}

const defaultCities = [
  'Bloemfontein', 'Johannesburg', 'Soweto',
  'Pretoria', 'Cape Town', 'Durban',
  'Kimberley', 'Welkom', 'Polokwane',
  'Gqeberha', 'East London', 'Pietermaritzburg',
  'Rustenburg', 'Mbombela'
]

const normal = (s: string) => s.trim().toLocaleLowerCase()

export default function RegistrationOtherPicker({
  kind, value, choices, suggestions, onChange
}: Props) {
  const standard = kind === 'city' ? defaultCities : choices

  const [other, setOther] = useState(
    Boolean(value && !standard.some(x => normal(x) === normal(value)))
  )
  const [open, setOpen] = useState<'select' | 'search' | null>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})

  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const isKnown = standard.some(x => normal(x) === normal(value))
  const selectedText = other
    ? 'Other'
    : value && isKnown
      ? value
      : kind === 'city'
        ? 'Select city / town'
        : 'Select suburb'

  const searchMatches = [...new Set(suggestions)]
    .filter(name => normal(name).startsWith(normal(value)))
    .slice(0, 8)

  useEffect(() => {
    if (!open) return

    function position() {
      const anchor = open === 'search'
        ? inputRef.current
        : buttonRef.current

      if (!anchor) return

      const rect = anchor.getBoundingClientRect()
      const below = window.innerHeight - rect.bottom - 10
      const above = rect.top - 10
      const upward = below < 170 && above > below

      const height = Math.max(
        65,
        Math.min(160, upward ? above - 5 : below - 5)
      )
      const width = Math.min(
        240,
        window.innerWidth - 20,
        Math.max(160, rect.width)
      )
      const left = Math.max(
        10,
        Math.min(rect.left, window.innerWidth - width - 10)
      )
      const top = upward
        ? Math.max(5, rect.top - height - 5)
        : rect.bottom + 5

      const modal = rootRef.current?.closest('.ct-reg-v3-modal')
      const theme = window.getComputedStyle(modal || anchor)
      const color = (variable: string, fallback: string) =>
        theme.getPropertyValue(variable).trim() || fallback

      setMenuStyle({
        position: 'fixed',
        zIndex: 2147483000,
        left,
        top,
        width,
        maxHeight: height,
        overflowY: 'auto',
        background: color('--reg-bg', '#fff'),
        color: color('--reg-text', '#172b45'),
        border: `1px solid ${color('--reg-border', '#d8e2ee')}`,
        borderRadius: 7,
        boxShadow: '0 8px 22px rgba(0,0,0,.17)',
        padding: 3
      })
    }

    function outside(event: PointerEvent) {
      const target = event.target as Node
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(null)
      }
    }

    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    document.addEventListener('pointerdown', outside)

    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      document.removeEventListener('pointerdown', outside)
    }
  }, [open])

  function select(next: string) {
    if (next === '__other__') {
      setOther(true)
      onChange('')
    } else {
      setOther(false)
      onChange(next)
    }
    setOpen(null)
  }

  const menuItems = open === 'select'
    ? [...standard, '__other__']
    : normal(value)
      ? searchMatches
      : []

  return (
    <div className="ct-location-compact-v6" ref={rootRef}>
      <label className="ct-location-title-v6">
        {kind === 'city' ? 'City / Town *' : 'Suburb *'}
      </label>

      <button
        ref={buttonRef}
        type="button"
        className="ct-location-trigger-v6"
        aria-haspopup="listbox"
        aria-expanded={open === 'select'}
        onClick={() => setOpen(open === 'select' ? null : 'select')}
      >
        <span>{selectedText}</span>
        <span aria-hidden="true">⌄</span>
      </button>

      {other && (
        <div className="ct-location-other-v6">
          <input
            ref={inputRef}
            type="text"
            value={value}
            autoComplete="off"
            placeholder={
              kind === 'city'
                ? 'Search other city / town'
                : 'Search other suburb'
            }
            onFocus={() => setOpen('search')}
            onChange={event => {
              onChange(event.target.value)
              setOpen('search')
            }}
            aria-label={'Other ' + kind}
            aria-autocomplete="list"
          />
        </div>
      )}

      {open && menuItems.length > 0 &&
        createPortal(
          <div
            ref={menuRef}
            className="ct-location-floating-v6"
            role="listbox"
            style={menuStyle}
          >
            {menuItems.map(item => (
              <button
                type="button"
                role="option"
                aria-selected={normal(item) === normal(value)}
                key={item}
                className="ct-location-menu-option-v6"
                onClick={() => {
                  if (open === 'select') {
                    select(item)
                  } else {
                    onChange(item)
                    setOpen(null)
                  }
                }}
              >
                {item === '__other__'
                  ? 'Other — search or enter'
                  : item}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
