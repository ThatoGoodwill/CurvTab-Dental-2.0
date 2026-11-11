import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../services/api'
import {
  NO_PERSONAL_PREFS,
  normalisePrefs,
  readCachedPrefs,
  writeCachedPrefs,
} from '../workspace/workspacePrefs'
import type { UserWorkspacePrefs } from '../workspace/workspacePrefs'

export type WorkspacePreferencesApi = {
  // The signed-in account's own choices. Null fields follow the practice default.
  prefs: UserWorkspacePrefs
  loaded: boolean
  save: (next: UserWorkspacePrefs) => Promise<UserWorkspacePrefs>
}

// Loads and saves the signed-in account's theme/layout choice (GET/PUT /api/me/appearance).
export function useWorkspacePreferences(
  userId: string | null | undefined,
): WorkspacePreferencesApi {
  const [stored, setStored] = useState<{
    userId: string
    prefs: UserWorkspacePrefs
  } | null>(null)

  const cached = useMemo(() => readCachedPrefs(userId), [userId])

  useEffect(() => {
    let active = true
    if (!userId) return

    apiRequest<unknown>('/me/appearance')
      .then(value => {
        if (!active) return
        const prefs = normalisePrefs(value)
        writeCachedPrefs(userId, prefs)
        setStored({ userId, prefs })
      })
      .catch(() => {
        // Keep whatever is cached; the practice default still applies.
      })

    return () => {
      active = false
    }
  }, [userId])

  const save = useCallback(
    async (next: UserWorkspacePrefs) => {
      if (!userId) throw new Error('Sign in to save your preferences.')
      const value = await apiRequest<unknown>('/me/appearance', 'PUT', next)
      const prefs = normalisePrefs(value)
      writeCachedPrefs(userId, prefs)
      setStored({ userId, prefs })
      return prefs
    },
    [userId],
  )

  const fresh = stored?.userId === userId ? stored.prefs : null

  return {
    prefs: fresh ?? cached ?? NO_PERSONAL_PREFS,
    loaded: fresh !== null,
    save,
  }
}
