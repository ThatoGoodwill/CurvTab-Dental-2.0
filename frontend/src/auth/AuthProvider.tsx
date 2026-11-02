import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import type { ReactNode } from 'react'
import { ApiError, authApi } from '../services/api'
import type { UserProfile } from '../services/api'
import { AuthContext } from './AuthContext'

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
      const profile = await authApi.me()
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

    authApi.me()
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