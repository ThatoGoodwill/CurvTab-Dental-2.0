import { createContext, useContext } from 'react'
import type { UserProfile } from '../services/api'

// All information and functions available to authenticated components.
export interface AuthContextValue {
  user: UserProfile | null
  loading: boolean
  startupError: string | null
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<void>
}

// Stores authentication state for our React application.
export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
)

// Other components use this function to access authentication.
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}