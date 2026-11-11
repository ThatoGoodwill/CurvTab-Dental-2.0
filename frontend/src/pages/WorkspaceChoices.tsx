import { LAYOUTS, THEMES } from '../workspace/workspacePrefs'
import type {
  LayoutPreset,
  NavigationMode,
  ThemeSurface,
} from '../workspace/workspacePrefs'
import './WorkspaceChoices.css'

// Shared pickers. The practice-default screen and each account's personal screen both use them,
// so a new theme or layout added to workspacePrefs.ts appears in both places automatically.

type ThemeChoicesProps = {
  name: string
  value: ThemeSurface | null
  onChange: (value: ThemeSurface | null) => void
  // Personal screens can fall back to the practice default (value === null).
  inheritLabel?: string
}

export function ThemeChoices({
  name,
  value,
  onChange,
  inheritLabel,
}: ThemeChoicesProps) {
  return (
    <div className="ct-choice-grid" role="radiogroup" aria-label="Colour theme">
      {inheritLabel !== undefined && (
        <label
          className={'ct-choice' + (value === null ? ' selected' : '')}
        >
          <input
            type="radio"
            name={name}
            checked={value === null}
            onChange={() => onChange(null)}
          />
          <span className="ct-choice-thumb ct-choice-inherit" aria-hidden="true">
            ↺
          </span>
          <strong>Practice default</strong>
          <small>{inheritLabel}</small>
        </label>
      )}

      {THEMES.map(theme => (
        <label
          key={theme.id}
          className={'ct-choice' + (value === theme.id ? ' selected' : '')}
        >
          <input
            type="radio"
            name={name}
            checked={value === theme.id}
            onChange={() => onChange(theme.id)}
          />
          <span
            className="ct-choice-thumb ct-theme-thumb"
            aria-hidden="true"
            style={{ background: theme.page }}
          >
            <i style={{ background: theme.sidebar }} />
            <b style={{ background: theme.accent }} />
            <em />
          </span>
          <strong>{theme.label}</strong>
          <small>{theme.description}</small>
        </label>
      ))}
    </div>
  )
}

type LayoutValue = {
  layoutPreset: LayoutPreset
  navigationMode: NavigationMode
}

type LayoutChoicesProps = {
  name: string
  value: LayoutValue | null
  onChange: (value: LayoutValue | null) => void
  inheritLabel?: string
}

export function LayoutChoices({
  name,
  value,
  onChange,
  inheritLabel,
}: LayoutChoicesProps) {
  return (
    <div className="ct-choice-grid" role="radiogroup" aria-label="Workspace layout">
      {inheritLabel !== undefined && (
        <label
          className={'ct-choice' + (value === null ? ' selected' : '')}
        >
          <input
            type="radio"
            name={name}
            checked={value === null}
            onChange={() => onChange(null)}
          />
          <span className="ct-choice-thumb ct-choice-inherit" aria-hidden="true">
            ↺
          </span>
          <strong>Practice default</strong>
          <small>{inheritLabel}</small>
        </label>
      )}

      {LAYOUTS.map(layout => {
        const selected =
          value !== null &&
          value.layoutPreset === layout.layoutPreset &&
          value.navigationMode === layout.navigationMode

        return (
          <label
            key={layout.id}
            className={'ct-choice' + (selected ? ' selected' : '')}
          >
            <input
              type="radio"
              name={name}
              checked={selected}
              onChange={() =>
                onChange({
                  layoutPreset: layout.layoutPreset,
                  navigationMode: layout.navigationMode,
                })
              }
            />
            <span
              className={
                'ct-choice-thumb ct-layout-thumb ' +
                `nav-${layout.navigationMode.toLowerCase()} ` +
                `density-${layout.layoutPreset.toLowerCase()}`
              }
              aria-hidden="true"
            >
              <i />
              <span>
                <b />
                <b />
                <b />
                <b />
              </span>
            </span>
            <strong>{layout.label}</strong>
            <small>{layout.description}</small>
          </label>
        )
      })}
    </div>
  )
}
