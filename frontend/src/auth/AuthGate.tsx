import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Activity, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useAuth } from './AuthContext'
import './AuthPages.css'
import { apiRequest } from '../services/api'
import './PracticeAuthTheme.css'
import PracticeBrandMark from './PracticeBrandMark'
import { usePracticeAppearance } from '../hooks/usePracticeAppearance'


type PublicPracticeBranding = {
  displayName: string
  tagline: string
  primaryColor: string
  accentColor: string
  logoUrl?: string | null
  badgeUrl?: string | null
  loginBackgroundUrl?: string | null
}

function cachedPracticeBranding(practiceId: string | null | undefined) {
  if (!practiceId) return null

  try {
    const raw = sessionStorage.getItem(`ct-branding:${practiceId}`)
    if (!raw) return null

    const value = JSON.parse(raw) as PublicPracticeBranding

    if (
      !/^#[0-9a-f]{6}$/i.test(value.primaryColor) ||
      !/^#[0-9a-f]{6}$/i.test(value.accentColor)
    ) return null

    return value
  } catch {
    return null
  }
}

function usePublicPracticeBranding(practiceId: string | null | undefined) {
  const [saved, setSaved] = useState<{
    practiceId: string
    value: PublicPracticeBranding
  } | null>(() => {
    const cached = cachedPracticeBranding(practiceId)
    return practiceId && cached
      ? { practiceId, value: cached }
      : null
  })

  useEffect(() => {
    let active = true

    if (
      !practiceId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(practiceId)
    ) return

    apiRequest<PublicPracticeBranding>(
      `/public/practice-branding/${encodeURIComponent(practiceId)}`
    )
      .then(value => {
        if (!active) return

        setSaved({ practiceId, value })

        try {
          sessionStorage.setItem(
            `ct-branding:${practiceId}`,
            JSON.stringify(value)
          )
        } catch {
          // Storage may be unavailable; API branding still works.
        }
      })
      .catch(() => {
        // Keep valid cached branding if the API is temporarily unavailable.
      })

    return () => { active = false }
  }, [practiceId])

  if (!practiceId) return null

  return saved?.practiceId === practiceId
    ? saved.value
    : cachedPracticeBranding(practiceId)
}

// Login screen.
function LoginScreen() {
  const { login } = useAuth()

  const practiceFromUrl =
    new URLSearchParams(window.location.search).get('practice')

  const practiceId =
    practiceFromUrl ||
    localStorage.getItem('ct-last-practice-id')

  const branding = usePublicPracticeBranding(practiceId)

  useEffect(() => {
    if (practiceFromUrl &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(practiceFromUrl)) {
      localStorage.setItem('ct-last-practice-id', practiceFromUrl)
    }
  }, [practiceFromUrl])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryLink] = useState(() => {
    const hash = window.location.hash.startsWith('#reset-') ? window.location.hash.slice(1) : ''
    const qs = new URLSearchParams(hash)
    return { email: qs.get('reset-email') || '', token: qs.get('reset-token') || '' }
  })
  const [recoveryMode, setRecoveryMode] = useState<'login' | 'request' | 'reset'>(
    recoveryLink.email && recoveryLink.token ? 'reset' : 'login'
  )
  const [recoveryEmail, setRecoveryEmail] = useState(recoveryLink.email)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!recoveryLink.token) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [recoveryLink.token])

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setRecoveryMessage('')
    setRecoveryBusy(true)
    try {
      const result = await apiRequest<{message:string}>('/auth/forgot-password', 'POST', {
        email: recoveryEmail.trim()
      })
      setRecoveryMessage(result.message)
    } catch(err) {
      setError(err instanceof Error ? err.message : 'Password recovery is temporarily unavailable.')
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (newPassword.length < 12 || !/[A-Z]/.test(newPassword) ||
        !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Use at least 12 characters with uppercase, lowercase and a number.')
      return
    }
    setRecoveryBusy(true)
    try {
      await apiRequest<void>('/auth/reset-password', 'POST', {
        email: recoveryLink.email,
        token: recoveryLink.token,
        newPassword,
      })
      setNewPassword('')
      setConfirmPassword('')
      setPassword('')
      setRecoveryMode('login')
      setRecoveryMessage('Password updated. You can now sign in with your new password.')
    } catch(err) {
      setError(err instanceof Error ? err.message : 'The reset link is invalid or expired.')
    } finally {
      setRecoveryBusy(false)
    }
  }
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
    <div
      className="auth-screen ct-auth-login"
      style={{
        '--auth-primary': branding?.primaryColor || '#126ce5',
        '--auth-accent': branding?.accentColor || '#14b8a6',
        '--ct-login-bg-image': branding?.loginBackgroundUrl ? `url("${branding.loginBackgroundUrl}")` : undefined,
      } as React.CSSProperties}
    >
      <div className="auth-card">
        <div className="auth-logo">
          <PracticeBrandMark
            src={branding?.logoUrl || branding?.badgeUrl}
            alt={branding?.displayName || 'Practice'}
            fallback={<Activity size={28} />}
          />
        </div>

        <div className="auth-brand">
          {branding?.displayName || 'CURVTAB DENTAL 2.0'}
        </div>

        <h1>Welcome back</h1>
        <p>
          {branding?.tagline || 'Sign in to your dental practice workspace.'}
        </p>

        {recoveryMode === 'login' && (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>Email address
              <input type="email" autoComplete="username" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@practice.com" required />
            </label>
            <label>Password
              <input type="password" autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)} required />
            </label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            {recoveryMessage && <div className="ct-recovery-success" role="status">{recoveryMessage}</div>}
            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in securely'}
            </button>
            <button type="button" className="ct-forgot-password-link"
              onClick={() => { setError(''); setRecoveryMessage(''); setRecoveryEmail(email); setRecoveryMode('request') }}>
              Forgot your password?
            </button>
          </form>
        )}
        {recoveryMode === 'request' && (
          <form className="auth-form" onSubmit={requestRecovery}>
            <h2 className="ct-recovery-heading">Reset password</h2>
            <p className="ct-recovery-description">
              Enter your account email. If it is eligible, we will email you a secure, 30-minute reset link.
            </p>
            <label>Account email
              <input type="email" autoComplete="email" required maxLength={256}
                value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} />
            </label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            {recoveryMessage && <div className="ct-recovery-success" role="status">{recoveryMessage}</div>}
            <button type="submit" className="auth-submit" disabled={recoveryBusy}>
              {recoveryBusy ? 'Sending request...' : 'Email reset link'}
            </button>
            <button type="button" className="ct-forgot-password-link"
              onClick={() => { setError(''); setRecoveryMessage(''); setRecoveryMode('login') }}>
              Back to sign in
            </button>
          </form>
        )}
        {recoveryMode === 'reset' && (
          <form className="auth-form" onSubmit={resetPassword}>
            <h2 className="ct-recovery-heading">Choose a new password</h2>
            <p className="ct-recovery-description">Resetting access for {recoveryLink.email}.</p>
            <label>New password
              <input type="password" autoComplete="new-password" minLength={12}
                maxLength={128} required value={newPassword}
                onChange={e => setNewPassword(e.target.value)} />
            </label>
            <label>Confirm new password
              <input type="password" autoComplete="new-password" minLength={12}
                maxLength={128} required value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} />
            </label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button type="submit" className="auth-submit" disabled={recoveryBusy}>
              {recoveryBusy ? 'Resetting...' : 'Save new password'}
            </button>
            <button type="button" className="ct-forgot-password-link"
              onClick={() => { setError(''); setRecoveryMode('request') }}>
              Request a new link
            </button>
          </form>
        )}

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
  const publicBranding = usePublicPracticeBranding(user?.practiceId)
  const { appearance } = usePracticeAppearance(user?.practiceId)

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
    <div
      className="auth-screen ct-auth-password"
      style={{
        '--auth-primary': publicBranding?.primaryColor || appearance?.primaryColor || '#126ce5',
        '--auth-accent': publicBranding?.accentColor || appearance?.accentColor || '#14b8a6',
        '--ct-login-bg-image': (publicBranding?.loginBackgroundUrl || appearance?.loginBackgroundUrl) ? `url("${publicBranding?.loginBackgroundUrl || appearance?.loginBackgroundUrl}")` : undefined,
      } as React.CSSProperties}
    >
      <div className="auth-card">
        <div className="auth-logo">
          <PracticeBrandMark
            src={
              publicBranding?.logoUrl ||
              appearance?.logoUrl ||
              publicBranding?.badgeUrl ||
              appearance?.badgeUrl
            }
            alt={
              publicBranding?.displayName ||
              appearance?.displayName ||
              'Practice'
            }
            fallback={<LockKeyhole size={28} />}
          />
        </div>

        <div className="ct-auth-practice-name">
          {publicBranding?.displayName || appearance?.displayName || user?.practiceName || 'Dental Practice'}
        </div>
        {(publicBranding?.tagline || appearance?.tagline) && (
          <p className="ct-auth-tagline">{publicBranding?.tagline || appearance?.tagline}</p>
        )}
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

  // AUTO-REMEMBER AUTHENTICATED PRACTICE
  // On successful authentication, remember the employee's actual
  // practice. This is a visual preference, not an access permission.
  useEffect(() => {
    if (!user) return

    const id = user.practiceId

    if (
      id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      localStorage.setItem('ct-last-practice-id', id)
    }
  }, [user?.practiceId])



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