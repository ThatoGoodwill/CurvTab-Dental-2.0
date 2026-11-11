import { useState } from 'react'
import { CheckCircle2, Save } from 'lucide-react'
import { LayoutChoices, ThemeChoices } from './WorkspaceChoices'
import { LAYOUTS, THEMES } from '../workspace/workspacePrefs'
import type {
  LayoutPreset,
  NavigationMode,
  ThemeSurface,
  UserWorkspacePrefs,
} from '../workspace/workspacePrefs'
import type { WorkspacePreferencesApi } from '../hooks/useWorkspacePreferences'

type PracticeDefault = {
  themeSurface: ThemeSurface
  layoutPreset: LayoutPreset
  navigationMode: NavigationMode
}

type Props = {
  workspace: WorkspacePreferencesApi
  // The practice default every account follows until it picks its own. Null for platform admins,
  // who belong to no practice and therefore only choose a colour theme.
  practiceDefault: PracticeDefault | null
}

// "My workspace": the signed-in account's own theme and layout. Saved to the account on the server,
// so it follows the person to any device and never changes anyone else's screen.
export default function MyWorkspacePreferences({
  workspace,
  practiceDefault,
}: Props) {
  const { prefs, save } = workspace
  const [draft, setDraft] = useState<UserWorkspacePrefs | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  const current = draft ?? prefs
  const layoutValue =
    current.layoutPreset && current.navigationMode
      ? {
          layoutPreset: current.layoutPreset,
          navigationMode: current.navigationMode,
        }
      : null

  const themeName = (id: ThemeSurface) =>
    THEMES.find(item => item.id === id)?.label ?? id
  const layoutName = (preset: LayoutPreset, nav: NavigationMode) =>
    LAYOUTS.find(
      item => item.layoutPreset === preset && item.navigationMode === nav,
    )?.label ?? `${preset} / ${nav}`

  function change(partial: Partial<UserWorkspacePrefs>) {
    setDraft({ ...current, ...partial })
    setMessage('')
  }

  async function submit() {
    if (!draft || busy) return
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      await save(draft)
      setDraft(null)
      setMessage('Saved. Your workspace now looks the way you chose.')
    } catch (cause) {
      setFailed(true)
      setMessage(
        cause instanceof Error ? cause.message : 'Could not save your choice.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel ct-my-workspace">
      <div className="ct-choice-section">
        <h3>My workspace</h3>
        <p>
          Choose how CurvTab looks for you. This only changes your own
          account, on every device you sign in from.
        </p>
      </div>

      <div className="ct-choice-section">
        <h3>Colour theme</h3>
        <ThemeChoices
          name="my-theme"
          value={current.themeSurface}
          onChange={value => change({ themeSurface: value })}
          inheritLabel={
            practiceDefault
              ? `Currently ${themeName(practiceDefault.themeSurface)}`
              : 'Use the standard theme'
          }
        />
      </div>

      {practiceDefault && (
        <div className="ct-choice-section">
          <h3>Layout</h3>
          <LayoutChoices
            name="my-layout"
            value={layoutValue}
            onChange={value =>
              change({
                layoutPreset: value?.layoutPreset ?? null,
                navigationMode: value?.navigationMode ?? null,
              })
            }
            inheritLabel={`Currently ${layoutName(
              practiceDefault.layoutPreset,
              practiceDefault.navigationMode,
            )}`}
          />
        </div>
      )}

      <div className="ct-choice-actions">
        <button
          type="button"
          className="primary-button"
          disabled={!draft || busy}
          onClick={() => void submit()}
        >
          <Save size={16} />
          {busy ? 'Saving…' : 'Save my workspace'}
        </button>

        {message && (
          <p
            className={'ct-choice-message ' + (failed ? 'error' : 'ok')}
            role={failed ? 'alert' : 'status'}
          >
            {!failed && <CheckCircle2 size={14} />} {message}
          </p>
        )}
      </div>
    </section>
  )
}
