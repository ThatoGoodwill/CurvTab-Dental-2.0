
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Users,
  UserPlus,
  Search,
  RefreshCw,
  KeyRound,
  UserCheck,
  UserX,
  ShieldCheck,
} from 'lucide-react'

import { apiRequest } from '../services/api'
import LaboratoryAccountsPanel from './LaboratoryAccountsPanel'
import EmployeeWorkspaceManagementPanel from './EmployeeWorkspaceManagementPanel'
import './StaffPage.css'

// Matches the StaffDto returned by our ASP.NET Core API.
interface StaffMember {
  id: string
  email: string
  fullName: string
  role: string
  isActive: boolean
  mustChangePassword: boolean
}

// Our first UI supports the two main clinic roles.
// The backend remains responsible for validating allowed roles.
type StaffRole = 'Receptionist' | 'Dentist' | 'LabTechnician'

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const [staffPanel, setStaffPanel] = useState<'none' | 'add' | 'directory'>('none')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // New employee form.
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRole>('Receptionist')
  const [password, setPassword] = useState('')

  // Password reset form.
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState('')

  // Load staff from GET /api/staff.
  // The backend automatically restricts results to the
  // currently logged-in PracticeAdmin's dental practice.
  useEffect(() => {
    let cancelled = false

    apiRequest<StaffMember[]>('/staff')
      .then((data) => {
        if (cancelled) return

        if (!Array.isArray(data)) {
          throw new Error('Unexpected staff response from the API.')
        }

        setStaff(data)
        setError('')
      })
      .catch((cause: unknown) => {
        if (cancelled) return

        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load staff.'
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  function refresh() {
    setLoading(true)
    setRefreshKey((value) => value + 1)
  }

  // POST /api/staff
  // The API automatically assigns the current practice ID
  // and requires the new employee to change their password.
  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (password.length < 10 || password.length > 128) {
      setError('Password must contain between 10 and 128 characters.')
      return
    }

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      await apiRequest<StaffMember>('/staff', 'POST', {
        fullName: fullName.trim(),
        email: email.trim(),
        role,
        temporaryPassword: password,
      })

      setSuccess(`${role} account created successfully.`)

      // Never store temporary passwords in browser storage.
      setFullName('')
      setEmail('')
      setPassword('')
      setRole('Receptionist')
      setStaffPanel('none')

      refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Failed to create staff account.'
      )
    } finally {
      setBusy(false)
    }
  }

  // PATCH /api/staff/{id}/active
  async function changeStatus(person: StaffMember) {
    const action = person.isActive ? 'deactivate' : 'activate'

    if (!window.confirm(
      `Are you sure you want to ${action} ${person.fullName}?`
    )) {
      return
    }

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      await apiRequest<void>(
        `/staff/${encodeURIComponent(person.id)}/active`,
        'PATCH',
        { isActive: !person.isActive }
      )

      setSuccess(
        `${person.fullName} ${
          person.isActive ? 'deactivated' : 'activated'
        } successfully.`
      )

      refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to update account status.'
      )
    } finally {
      setBusy(false)
    }
  }

  // POST /api/staff/{id}/reset-password
  // Creates a temporary password and requires a change
  // when the employee next logs in.
  async function resetStaffPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!resetUserId) return

    if (resetPassword.length < 10 || resetPassword.length > 128) {
      setError('Password must contain between 10 and 128 characters.')
      return
    }

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      await apiRequest<void>(
        `/staff/${encodeURIComponent(resetUserId)}/reset-password`,
        'POST',
        { temporaryPassword: resetPassword }
      )

      setSuccess('Temporary password reset successfully.')
      setResetUserId(null)
      setResetPassword('')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to reset password.'
      )
    } finally {
      setBusy(false)
    }
  }

  // Search only the staff returned by this practice's API.
  const filtered = staff.filter((person) => {
    const value = search.toLowerCase().trim()

    return (
      person.fullName.toLowerCase().includes(value) ||
      person.email.toLowerCase().includes(value) ||
      person.role.toLowerCase().includes(value)
    )
  })

  const activeCount = staff.filter((person) => person.isActive).length

  return (
    <div className="staff-page">

      <div className="page-heading">
        <div>
          <div className="eyebrow">PRACTICE MANAGEMENT</div>
          <h1>Staff Management</h1>
          <p>
            Register employees, manage accounts and control access
            to your dental practice.
          </p>
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={refresh}
          disabled={loading || busy}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      {/* Real counts loaded from the backend. */}
      <div className="staff-summary">
        <div className="stat-card">
          <div className="stat-top">
            <span>Staff Accounts</span>
            <Users size={19} />
          </div>

          <strong className="stat-value">
            {loading || error ? '—' : staff.length}
          </strong>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span>Active Staff</span>
            <UserCheck size={19} />
          </div>

          <strong className="stat-value">
            {loading || error ? '—' : activeCount}
          </strong>
        </div>
      </div>

      {error && (
        <div className="staff-alert staff-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="staff-alert staff-success" role="status">
          {success}
        </div>
      )}

      <div className="ct-staff-toolbar">
        <button type="button" className={staffPanel === 'add' ? 'primary-button' : 'secondary-button'}
          aria-expanded={staffPanel === 'add'} onClick={() => setStaffPanel(panel => panel === 'add' ? 'none' : 'add')}>
          <UserPlus size={15}/> {staffPanel === 'add' ? 'Close employee form' : 'Add Employee'}
        </button>
        <button type="button" className={staffPanel === 'directory' ? 'primary-button' : 'secondary-button'}
          aria-expanded={staffPanel === 'directory'} onClick={() => setStaffPanel(panel => panel === 'directory' ? 'none' : 'directory')}>
          <Users size={15}/> {staffPanel === 'directory' ? 'Close Staff Directory' : 'View Staff Directory'}
        </button>
      </div>
      <div className="staff-layout">

        {/* CREATE EMPLOYEE */}
        {staffPanel === 'add' && <section className="panel ct-staff-action-panel">
          <div className="staff-section-title">
            <UserPlus size={20} />
            <h2>Add Employee</h2>
          </div>

          <p className="staff-description">
            Create a login for a receptionist, dentist or laboratory technician.
          </p>

          <form className="staff-form" onSubmit={createStaff}>
            <label htmlFor="staff-fullname">Full name</label>
            <input
              id="staff-fullname"
              required
              minLength={2}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Employee full name"
            />

            <label htmlFor="staff-email">Email address</label>
            <input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="employee@example.com"
            />

            <label htmlFor="staff-role">Staff role</label>
            <select
              id="staff-role"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as StaffRole)
              }
            >
              <option value="Receptionist">Receptionist</option>
              <option value="Dentist">Dentist</option>
              <option value="LabTechnician">Lab Technician</option>
            </select>

            <label htmlFor="staff-password">
              Temporary password
            </label>

            <input
              id="staff-password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 10 characters"
            />

            <p className="staff-description">
              The employee must change this password after
              their first login.
            </p>

            <button
              className="primary-button"
              type="submit"
              disabled={busy}
            >
              <UserPlus size={17} />
              {busy ? 'Saving...' : 'Create Employee'}
            </button>
          </form>
        </section>}

        {/* STAFF DIRECTORY */}
        {staffPanel === 'directory' && <section className="panel ct-staff-action-panel">
          <div className="staff-section-title">
            <ShieldCheck size={20} />
            <h2>Staff Directory</h2>
          </div>

          <div className="staff-search">
            <Search size={18} />

            <input
              aria-label="Search staff"
              placeholder="Search name, email or role..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {loading ? (
            <p className="staff-description">Loading staff...</p>
          ) : error && staff.length === 0 ? (
            <p className="staff-description">
              Staff could not be loaded.
            </p>
          ) : filtered.length === 0 ? (
            <p className="staff-description">
              No matching staff members.
            </p>
          ) : (
            <div className="staff-directory">
              {filtered.map((person) => (
                <div className="staff-member" key={person.id}>
                  <div className="staff-member-header">
                    <div>
                      <strong>{person.fullName}</strong>
                      <span>{person.email}</span>
                    </div>

                    <span
                      className={
                        person.isActive
                          ? 'staff-status active'
                          : 'staff-status inactive'
                      }
                    >
                      {person.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="staff-member-meta">
                    <span>{person.role}</span>

                    {person.mustChangePassword && (
                      <span>Password change required</span>
                    )}
                  </div>

                  {/* A PracticeAdmin cannot use these operations
                      to manage another PracticeAdmin account. */}
                  {person.role !== 'PracticeAdmin' && (
                    <div className="staff-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => {
                          setResetUserId(person.id)
                          setResetPassword('')
                          setError('')
                        }}
                      >
                        <KeyRound size={15} />
                        Reset Password
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void changeStatus(person)}
                      >
                        {person.isActive ? (
                          <UserX size={15} />
                        ) : (
                          <UserCheck size={15} />
                        )}

                        {person.isActive
                          ? 'Deactivate'
                          : 'Activate'}
                      </button>
                    </div>
                  )}

                  {/* Inline password reset form */}
                  {resetUserId === person.id && (
                    <form
                      className="staff-reset-form"
                      onSubmit={resetStaffPassword}
                    >
                      <label htmlFor={`reset-${person.id}`}>
                        New temporary password
                      </label>

                      <input
                        id={`reset-${person.id}`}
                        type="password"
                        minLength={10}
                        maxLength={128}
                        required
                        autoComplete="new-password"
                        value={resetPassword}
                        onChange={(event) =>
                          setResetPassword(event.target.value)
                        }
                      />

                      <div className="staff-actions">
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={busy}
                        >
                          Save Password
                        </button>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            setResetUserId(null)
                            setResetPassword('')
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>}
      </div>
      <details className="ct-staff-hr-details">
        <summary>Employee records, rosters and leave approvals</summary>
        <EmployeeWorkspaceManagementPanel />
      </details>
      <details className="ct-staff-hr-details">
        <summary>Laboratory accounts and technician assignments</summary>
        <LaboratoryAccountsPanel />
      </details>
    </div>
  )
}
