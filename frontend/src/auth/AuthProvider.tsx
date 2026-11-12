import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import type { ReactNode } from 'react'
import { ApiError, authApi } from '../services/api'
import type { UserProfile } from '../services/api'
import { AuthContext } from './AuthContext'

// A 429 can be imposed by the hosting edge even on the unthrottled /auth/me
// endpoint. Retry ONLY this safe session GET with bounded backoff. Never
// automatically retry login or payment mutations.
async function fetchSessionWithBackoff(): Promise<UserProfile> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await authApi.me()
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429 || attempt === 2)
        throw error
      // Do not hammer a host that told us to wait longer than our retry
      // budget. Show a recoverable message and leave the manual Retry option.
      if (error.retryAfterMs !== null && error.retryAfterMs > 12000)
        throw error
      const base = attempt === 0 ? 2500 : 6500
      const delay = Math.max(base, error.retryAfterMs ?? 0) + Math.floor(Math.random() * 450)
      await new Promise<void>(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Unable to check the current session.')
}

// This component provides authentication state to the application.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [startupError, setStartupError] = useState<string | null>(null)

  // Checks whether an API error means the user is not logged in.
  function isUnauthorized(error: unknown) {
    return error instanceof ApiError && error.status === 401
  }

  // Manually refreshes the user's session when needed.
  const refresh = useCallback(async () => {
    setLoading(true)
    setStartupError(null)

    try {
      const profile = await fetchSessionWithBackoff()
      setUser(profile)
    } catch (error) {
      if (isUnauthorized(error)) {
        setUser(null)
      } else {
        setStartupError(
          error instanceof Error
            ? error.message
            : 'Unable to connect to the API.'
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  // Check the existing login session when React first loads.
  // State updates happen in asynchronous callbacks, avoiding
  // the React ESLint set-state-in-effect error.
  useEffect(() => {
    let active = true

    fetchSessionWithBackoff()
      .then((profile) => {
        if (active) {
          setUser(profile)
        }
      })
      .catch((error: unknown) => {
        if (!active) return

        if (isUnauthorized(error)) {
          setUser(null)
        } else {
          setStartupError(
            error instanceof Error
              ? error.message
              : 'Unable to connect to the API.'
          )
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    // Prevent outdated responses from updating unmounted components.
    return () => {
      active = false
    }
  }, [])

  // Sends credentials to the ASP.NET Core login endpoint.
  async function login(email: string, password: string) {
    const profile = await authApi.login(email, password)
    setStartupError(null)
    setUser(profile)
  }

  // Ends the server session before clearing the React user.
  async function logout() {
    await authApi.logout()
    setUser(null)
  }

  // Changes the password and loads the updated profile.
  async function changePassword(
    currentPassword: string,
    newPassword: string
  ) {
    await authApi.changePassword(currentPassword, newPassword)

    const updatedProfile = await authApi.me()
    setUser(updatedProfile)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        startupError,
        refresh,
        login,
        logout,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}