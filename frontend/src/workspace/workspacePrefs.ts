// Colour themes and workspace layouts.
//
// Two levels decide what an account sees:
//   1. Practice default  - set by the practice admin in Configuration Center > Appearance.
//   2. Personal choice   - set by each account; when empty the account follows the practice default.
//
// To add a layout, add ONE entry to LAYOUTS (and, if it needs new styling, a block in
// WorkspaceLayouts.css keyed on the layout's preset / navigation class). Nothing else changes.

export type ThemeSurface = 'white' | 'blue' | 'dark'
export type LayoutPreset = 'Classic' | 'Compact' | 'Clinical'
export type NavigationMode = 'Sidebar' | 'Topbar' | 'Rail'

export type UserWorkspacePrefs = {
  themeSurface: ThemeSurface | null
  layoutPreset: LayoutPreset | null
  navigationMode: NavigationMode | null
}

export const NO_PERSONAL_PREFS: UserWorkspacePrefs = {
  themeSurface: null,
  layoutPreset: null,
  navigationMode: null,
}

export const DEFAULT_THEME: ThemeSurface = 'blue'
export const DEFAULT_LAYOUT_PRESET: LayoutPreset = 'Classic'
export const DEFAULT_NAVIGATION: NavigationMode = 'Sidebar'

export type ThemeOption = {
  id: ThemeSurface
  label: string
  description: string
  // Colours for the little preview card only.
  sidebar: string
  page: string
  accent: string
}

export const THEMES: readonly ThemeOption[] = [
  {
    id: 'blue',
    label: 'Blue & White',
    description: 'Deep-blue navigation on a clean white workspace.',
    sidebar: '#0d3f7c',
    page: '#f3f6fb',
    accent: '#1769d1',
  },
  {
    id: 'white',
    label: 'White Only',
    description: 'Bright, quiet and white. Uses your practice colours.',
    sidebar: '#ffffff',
    page: '#f7f9fd',
    accent: '#096fdf',
  },
  {
    id: 'dark',
    label: 'Dark Blue',
    description: 'Navy workspace that is easy on the eyes at night.',
    sidebar: '#0a1d36',
    page: '#081a30',
    accent: '#2f8be6',
  },
] as const

export type LayoutOption = {
  id: string
  label: string
  description: string
  layoutPreset: LayoutPreset
  navigationMode: NavigationMode
}

export const LAYOUTS: readonly LayoutOption[] = [
  {
    id: 'classic-sidebar',
    label: 'Classic',
    description: 'Full sidebar with roomy cards and charts.',
    layoutPreset: 'Classic',
    navigationMode: 'Sidebar',
  },
  {
    id: 'compact-sidebar',
    label: 'Compact',
    description: 'Full sidebar with denser cards, more on screen.',
    layoutPreset: 'Compact',
    navigationMode: 'Sidebar',
  },
  {
    id: 'clinical-sidebar',
    label: 'Clinical Focus',
    description: 'Full sidebar with a focused clinical dashboard.',
    layoutPreset: 'Clinical',
    navigationMode: 'Sidebar',
  },
  {
    id: 'classic-topbar',
    label: 'Top Navigation',
    description: 'Navigation across the top, full-width workspace.',
    layoutPreset: 'Classic',
    navigationMode: 'Topbar',
  },
  {
    id: 'compact-topbar',
    label: 'Compact Top Bar',
    description: 'Top navigation with denser cards.',
    layoutPreset: 'Compact',
    navigationMode: 'Topbar',
  },
  {
    id: 'classic-rail',
    label: 'Icon Rail',
    description: 'Slim icon sidebar that opens when you hover it.',
    layoutPreset: 'Classic',
    navigationMode: 'Rail',
  },
  {
    id: 'compact-rail',
    label: 'Compact Rail',
    description: 'Icon rail with denser cards for small screens.',
    layoutPreset: 'Compact',
    navigationMode: 'Rail',
  },
] as const

export function layoutIdFor(
  preset: LayoutPreset,
  navigation: NavigationMode,
): string {
  return (
    LAYOUTS.find(
      item =>
        item.layoutPreset === preset && item.navigationMode === navigation,
    )?.id ?? ''
  )
}

export function isThemeSurface(value: unknown): value is ThemeSurface {
  return value === 'white' || value === 'blue' || value === 'dark'
}

export function isLayoutPreset(value: unknown): value is LayoutPreset {
  return value === 'Classic' || value === 'Compact' || value === 'Clinical'
}

export function isNavigationMode(value: unknown): value is NavigationMode {
  return value === 'Sidebar' || value === 'Topbar' || value === 'Rail'
}

// Defensive: never trust the shape of stored or returned data.
export function normalisePrefs(value: unknown): UserWorkspacePrefs {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    themeSurface: isThemeSurface(raw.themeSurface) ? raw.themeSurface : null,
    layoutPreset: isLayoutPreset(raw.layoutPreset) ? raw.layoutPreset : null,
    navigationMode: isNavigationMode(raw.navigationMode)
      ? raw.navigationMode
      : null,
  }
}

type PracticeDefaults = {
  themeSurface?: string | null
  layoutPreset?: string | null
  navigationMode?: string | null
} | null

export type EffectiveWorkspace = {
  themeSurface: ThemeSurface
  layoutPreset: LayoutPreset
  navigationMode: NavigationMode
}

// Personal choice wins; otherwise the practice default; otherwise the built-in default.
export function resolveWorkspace(
  personal: UserWorkspacePrefs,
  practice: PracticeDefaults,
  cachedTheme: ThemeSurface | null,
): EffectiveWorkspace {
  const practiceTheme = isThemeSurface(practice?.themeSurface)
    ? practice.themeSurface
    : null
  const practicePreset = isLayoutPreset(practice?.layoutPreset)
    ? practice.layoutPreset
    : null
  const practiceNav = isNavigationMode(practice?.navigationMode)
    ? practice.navigationMode
    : null

  return {
    themeSurface:
      personal.themeSurface ?? practiceTheme ?? cachedTheme ?? DEFAULT_THEME,
    layoutPreset:
      personal.layoutPreset ?? practicePreset ?? DEFAULT_LAYOUT_PRESET,
    navigationMode:
      personal.navigationMode ?? practiceNav ?? DEFAULT_NAVIGATION,
  }
}

// ---------- Browser cache (only to avoid a flash of the wrong theme on load) ----------

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage can be blocked; the server value still applies */
  }
}

const prefsKey = (userId: string) => `curvtab-workspace-prefs:${userId}`
const themeKey = (userId: string) => `curvtab-workspace-theme:${userId}`

export function readCachedPrefs(
  userId: string | null | undefined,
): UserWorkspacePrefs | null {
  if (!userId) return null
  const text = safeGet(prefsKey(userId))
  if (!text) return null
  try {
    return normalisePrefs(JSON.parse(text))
  } catch {
    return null
  }
}

export function writeCachedPrefs(userId: string, prefs: UserWorkspacePrefs) {
  safeSet(prefsKey(userId), JSON.stringify(prefs))
}

export function readCachedTheme(
  userId: string | null | undefined,
): ThemeSurface | null {
  if (!userId) return null
  const value = safeGet(themeKey(userId))
  return isThemeSurface(value) ? value : null
}

// Put the colour theme on <html>. The CSS in WorkspaceThemes.css reads these two attributes.
export function applyTheme(userId: string | null | undefined, theme: ThemeSurface) {
  const root = document.documentElement
  root.dataset.theme = theme === 'dark' ? 'dark' : 'light'
  root.dataset.surface = theme
  // index.html reads these two on the next page load, before React starts.
  safeSet('curvtab-theme', theme === 'dark' ? 'dark' : 'light')
  safeSet('curvtab-theme-choice', theme)
  if (userId) safeSet(themeKey(userId), theme)
}

export function clearTheme() {
  const root = document.documentElement
  delete root.dataset.surface
  root.dataset.theme = 'light'
}
