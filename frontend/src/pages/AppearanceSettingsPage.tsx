import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import {Settings2, 
  Palette,
  Save,
  CheckCircle2,
  LayoutDashboard,
  PanelLeft,
  Blocks,
  Images,
  Image as ImageIcon,
} from 'lucide-react'
import { apiRequest } from '../services/api'
import type { PracticeAppearance } from '../hooks/usePracticeAppearance'
import PracticeBrandAssetsEditor from './PracticeBrandAssetsEditor'
import PracticeSlidesEditor from './PracticeSlidesEditor'
import MyWorkspacePreferences from './MyWorkspacePreferences'
import { LayoutChoices, ThemeChoices } from './WorkspaceChoices'
import { isThemeSurface } from '../workspace/workspacePrefs'
import type { WorkspacePreferencesApi } from '../hooks/useWorkspacePreferences'
import './AppearanceSettingsPage.css'
import './AppearanceWorkspaceTabs.css'

type Props = {
  appearance: PracticeAppearance | null
  onSaved: (value: PracticeAppearance) => void
  // The signed-in admin's own theme/layout choice (shown under "My workspace").
  workspace?: WorkspacePreferencesApi
}

type AppearanceTab =
  | 'theme'
  | 'branding'
  | 'images'
  | 'slideshow'
  | 'workspace'

const OPTIONAL_MODULES = [
  'Patients',
  'Appointments',
  'Consultations',
  'Checkout & Payments',
  'Dental Charting',
  'Orthodontics',
] as const

const DEFAULT: PracticeAppearance = {
  displayName: '',
  tagline: '',
  primaryColor: '#126CE5',
  accentColor: '#14B8A6',
  layoutPreset: 'Classic',
  navigationMode: 'Sidebar',
  themeSurface: 'blue',
  enabledModules: [
    'Patients',
    'Appointments',
      'Consultations',
    'Checkout & Payments',
    'Dental Charting',
      'Orthodontics',
  ],
}

const TABS = [
  { id: 'theme', label: 'Theme & Layout', Icon: PanelLeft },
  { id: 'branding', label: 'Branding & Colours', Icon: Palette },
  { id: 'images', label: 'Logos & Images', Icon: ImageIcon },
  { id: 'slideshow', label: 'Dashboard Slideshow', Icon: Images },
  { id: 'workspace', label: 'Workspace Settings', Icon: LayoutDashboard },
] as const

export default function AppearanceSettingsPage({
  appearance,
  onSaved,
  workspace,
}: Props) {
  const [form, setForm] = useState<PracticeAppearance>(
    appearance ?? DEFAULT
  )
  const [activeTab, setActiveTab] =
    useState<AppearanceTab>('theme')

  // CT_APPEARANCE_DROPDOWN_V3
  const [appearanceMenuOpen, setAppearanceMenuOpen] =
    useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  function update(partial: Partial<PracticeAppearance>) {
    setForm(previous => ({ ...previous, ...partial }))
    setDirty(true)
    setSaved(false)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (saving) return

    setSaving(true)
    setError('')
    setSaved(false)

    try {
      const value = await apiRequest<PracticeAppearance>(
        '/practice/appearance',
        'PUT',
        form
      )

      onSaved(value)
      setForm(value)
      setDirty(false)
      setSaved(true)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save appearance'
      )
    } finally {
      setSaving(false)
    }
  }

  // What accounts follow right now (the last SAVED practice default, not unsaved edits).
  const savedDefault = appearance ?? DEFAULT

  const themeStyle = {
    '--appearance-accent': form.primaryColor,
    '--practice-primary': form.primaryColor,
    '--practice-accent': form.accentColor,
  } as CSSProperties

  return (
    <div
      className="appearance-settings ct-appearance-workspace"
      style={themeStyle}
    >
      <header className="page-heading">
        <div>
          <div className="eyebrow">PRACTICE PERSONALIZATION</div>
          <h1>Appearance & Workspace</h1>
          <p>
            Customize your practice's identity, branding
            and workspace. These settings apply only to your practice.
          </p>
        </div>
      </header>

      
      {/* CT_APPEARANCE_DROPDOWN_V3 */}
      <div className="ct-appearance-compact-nav">
        <div className="ct-appearance-dropdown">

          <button
            type="button"
            className="ct-appearance-dropdown-trigger"
            aria-expanded={appearanceMenuOpen}
            aria-controls="ct-appearance-dropdown-options"
            onClick={() =>
              setAppearanceMenuOpen(open => !open)
            }
          >
            <Settings2 size={15} aria-hidden="true" />
            <span>Appearance Settings</span>
            <span aria-hidden="true">
              {appearanceMenuOpen ? '▴' : '▾'}
            </span>
          </button>

          {appearanceMenuOpen && (
            <div
              id="ct-appearance-dropdown-options"
              className="ct-appearance-dropdown-menu"
              role="group"
              aria-label="Appearance settings sections"
            >
              <small>Choose a setting</small>

              {TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={
                    'ct-appearance-dropdown-item' +
                    (activeTab === id ? ' active' : '')
                  }
                  aria-current={
                    activeTab === id ? 'page' : undefined
                  }
                  onClick={() => {
                    setActiveTab(id)
                    setAppearanceMenuOpen(false)
                  }}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{label}</span>
                  {activeTab === id && (
                    <span
                      className="ct-appearance-menu-check"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="ct-appearance-current-tab">
          {TABS.find(item => item.id === activeTab)?.label}
        </span>
      </div>

<nav
        className="ct-appearance-original-tabs-v3 ct-appearance-tabs"
        aria-label="Appearance sections"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={
              'ct-appearance-tab' +
              (activeTab === id ? ' active' : '')
            }
            aria-current={
              activeTab === id ? 'page' : undefined
            }
            onClick={() => setActiveTab(id)}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {dirty && (
        <p className="ct-appearance-unsaved" role="status">
          You have unsaved appearance changes.
          Use Save appearance before leaving this workspace.
        </p>
      )}

      {activeTab === 'slideshow' && (
        <div className="ct-appearance-tab-panel">
          <PracticeSlidesEditor />
        </div>
      )}

      {activeTab === 'images' && (
        <div className="ct-appearance-tab-panel">
          <PracticeBrandAssetsEditor
            appearance={appearance ?? DEFAULT}
            onSaved={onSaved}
          />
        </div>
      )}

      {(activeTab === 'theme' ||
        activeTab === 'branding' ||
        activeTab === 'workspace') && (
        <form
          onSubmit={event => void submit(event)}
          className="appearance-settings-grid ct-appearance-tab-panel"
        >
          <section className="panel appearance-editor">
            {activeTab === 'theme' && (
              <>
                <h2>
                  <PanelLeft size={20} />
                  Practice default theme &amp; layout
                </h2>

                <p className="appearance-note">
                  This is what every account in your practice sees until
                  that person chooses their own under “My workspace” below.
                </p>

                <div className="ct-choice-section">
                  <h3>Colour theme</h3>
                  <ThemeChoices
                    name="practice-theme"
                    value={
                      isThemeSurface(form.themeSurface)
                        ? form.themeSurface
                        : 'blue'
                    }
                    onChange={value =>
                      update({ themeSurface: value ?? 'blue' })
                    }
                  />
                </div>

                <div className="ct-choice-section">
                  <h3>Workspace layout</h3>
                  <LayoutChoices
                    name="practice-layout"
                    value={{
                      layoutPreset: form.layoutPreset,
                      navigationMode: form.navigationMode,
                    }}
                    onChange={value => {
                      if (value) update(value)
                    }}
                  />
                </div>
              </>
            )}

            {activeTab === 'branding' && (
              <>
                <h2>
                  <Palette size={20} />
                  Practice branding
                </h2>

                <label>
                  Display name
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={form.displayName}
                    onChange={event =>
                      update({
                        displayName: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Welcome tagline
                  <input
                    maxLength={160}
                    value={form.tagline}
                    onChange={event =>
                      update({
                        tagline: event.target.value,
                      })
                    }
                    placeholder="A brighter, healthier smile"
                  />
                </label>

                <div className="appearance-colors">
                  <label>
                    Primary colour
                    <input
                      aria-label="Primary colour"
                      type="color"
                      value={form.primaryColor}
                      onChange={event =>
                        update({
                          primaryColor: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Accent colour
                    <input
                      aria-label="Accent colour"
                      type="color"
                      value={form.accentColor}
                      onChange={event =>
                        update({
                          accentColor: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <p className="appearance-note">
                  The navigation buttons above preview your
                  primary theme colour automatically.
                </p>
              </>
            )}

            {activeTab === 'workspace' && (
              <>
                <h2>
                  <LayoutDashboard size={20} />
                  Workspace settings
                </h2>

                <fieldset className="ct-v2-fieldset">
                  <legend>
                    <Blocks size={17} />
                    Workspace modules
                  </legend>

                  <p className="appearance-note">
                    Choose which modules staff can see.
                    Individual staff permissions still apply.
                    Dashboard, Settings and Profile remain available.
                  </p>

                  <div className="ct-v2-module-grid">
                    {OPTIONAL_MODULES.map(module => (
                      <label
                        className="ct-v2-module"
                        key={module}
                      >
                        <input
                          type="checkbox"
                          checked={
                            form.enabledModules.includes(module)
                          }
                          onChange={event =>
                            update({
                              enabledModules:
                                event.target.checked
                                  ? [
                                      ...form.enabledModules,
                                      module,
                                    ]
                                  : form.enabledModules.filter(
                                      item => item !== module
                                    ),
                            })
                          }
                        />
                        <span>{module}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}

            {error && (
              <p role="alert" className="appearance-error">
                {error}
              </p>
            )}

            {saved && (
              <p role="status" className="appearance-success">
                <CheckCircle2 size={17} />
                Saved for this practice.
              </p>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={saving || !dirty}
            >
              <Save size={17} />
              {saving ? 'Saving…' : 'Save appearance'}
            </button>
          </section>

          <section
            className="panel appearance-preview"
            style={themeStyle}
          >
            <h2>
              <LayoutDashboard size={20} />
              Live preview
            </h2>

            <div className="appearance-preview-hero">
              <span>YOUR DENTAL PRACTICE</span>
              <strong>
                {form.displayName || 'Practice Name'}
              </strong>
              <p>
                {form.tagline ||
                  'Welcome to your practice workspace'}
              </p>
            </div>

            <div className="ct-v2-preview-nav">
              <strong>
                {form.navigationMode === 'Topbar'
                  ? 'Upper navigation'
                  : form.navigationMode === 'Rail'
                    ? 'Icon rail navigation'
                    : 'Sidebar navigation'}
              </strong>
              <span>Dashboard</span>
              {form.enabledModules
                .slice(0, 5)
                .map(item => (
                  <span key={item}>{item}</span>
                ))}
              <span>My Profile</span>
            </div>

            <div className="appearance-preview-cards">
              {form.enabledModules
                .slice(0, 3)
                .map(item => (
                  <div key={item}>{item}</div>
                ))}
            </div>

            <p>Layout: {form.layoutPreset}</p>

            <p className="appearance-note">
              Saved branding and workspace preferences
              will be applied to your staff workspace.
            </p>
          </section>
        </form>
      )}

      {activeTab === 'theme' && workspace && (
        <div className="ct-appearance-tab-panel">
          <MyWorkspacePreferences
            workspace={workspace}
            practiceDefault={{
              themeSurface: isThemeSurface(savedDefault.themeSurface)
                ? savedDefault.themeSurface
                : 'blue',
              layoutPreset: savedDefault.layoutPreset,
              navigationMode: savedDefault.navigationMode,
            }}
          />
        </div>
      )}
    </div>
  )
}
