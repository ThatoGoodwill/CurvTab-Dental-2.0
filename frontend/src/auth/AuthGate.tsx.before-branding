import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Activity, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useAuth } from './AuthContext'
import './AuthPages.css'

// Login screen.
function LoginScreen() {
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await login(email, password)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Login failed.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <Activity size={28} />
        </div>

        <div className="auth-brand">CURVTAB DENTAL 2.0</div>

        <h1>Welcome back</h1>
        <p>Sign in to your dental practice workspace.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@practice.com"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={submitting}
          >
            {submitting ? 'Signing in...' : 'Sign in securely'}
          </button>
        </form>

        <div className="auth-security">
          <ShieldCheck size={17} />
          <span>Protected staff access</span>
        </div>
      </div>
    </div>
  )
}

// Users with temporary passwords see this screen first.
function ChangePasswordScreen() {
  const { user, changePassword, logout } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    setSubmitting(true)

    try {
      await changePassword(currentPassword, newPassword)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Password change failed.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <LockKeyhole size={28} />
        </div>

        <h1>Secure your account</h1>

        <p>
          Welcome, {user?.fullName || user?.email}.
          Please change your temporary password.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>

          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={12}
              required
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={12}
              required
            />
          </label>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={submitting}
          >
            {submitting ? 'Updating...' : 'Update password'}
          </button>
        </form>

        <button
          type="button"
          className="secondary-button"
          onClick={() => void logout()}
          style={{ marginTop: 16 }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

// NAMED EXPORT: main.tsx imports this exact function.
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading, startupError, refresh } = useAuth()

  if (loading) {
    return <div className="auth-loading">Checking your session...</div>
  }

  if (startupError) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>Connection unavailable</h1>
          <p>{startupError}</p>

          <button
            className="auth-submit"
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!user) return <LoginScreen />

  if (user.mustChangePassword) {
    return <ChangePasswordScreen />
  }

  // Authenticated users with valid passwords reach the dashboard.
  return <>{children}</>
}