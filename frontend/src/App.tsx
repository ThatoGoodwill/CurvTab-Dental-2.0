import LaboratoryModule from './pages/LaboratoryModule'
import { FlaskConical } from 'lucide-react'
import PlatformSubscriptionsPage from './pages/PlatformSubscriptionsPage'
import { useConfirmDialog } from './components/useConfirmDialog'
import './PlatformManagement.css'
import { Images as ClinicalImagingIcon } from 'lucide-react'
import ClinicalImagingPage from './pages/ClinicalImagingPage'
import { BriefcaseBusiness as CtManagementIcon, Palette as CtAppearanceIcon } from 'lucide-react'
import WhatsAppPanel from './pages/WhatsAppPanel'
import LiveClinicNotifications from './components/LiveClinicNotifications'
import ClinicDashboardEnhancements from './components/ClinicDashboardEnhancements'
import './CurvTabVisualUpgrade.css'
import OrthodonticsPage from './pages/OrthodonticsPage'
import BillingLedgerPanel from './pages/BillingLedgerPanel'
import './ClientThemeChoice.css'
import AuditLogPage from './pages/AuditLogPage'
import PlanAccountsPanel from './pages/PlanAccountsPanel'
import FinanceWorkspaceTabs from './pages/FinanceWorkspaceTabs'
import type { FinanceTab } from './pages/FinanceWorkspaceTabs'
import type { ThemeSurface } from './workspace/workspacePrefs'
import BillingWorkspaceTabs from './pages/BillingWorkspaceTabs'
import type { BillingSection } from './pages/BillingWorkspaceTabs'
import MedicalAidPanel from './pages/MedicalAidPanel'
import EmployeeWorkspacePage from './pages/EmployeeWorkspacePage'
import ClinicalClaimCorrectionsPage from './pages/ClinicalClaimCorrectionsPage'
import PatientBalancesPanel from './pages/PatientBalancesPanel'
import InvoicesPanel from './pages/InvoicesPanel'
import FinanceOperationsPanel from './pages/FinanceOperationsPanel'
import ReceptionCheckoutPage from './pages/ReceptionCheckoutPage'
import RandIcon from './components/RandIcon'
import { Wallet } from 'lucide-react'
import DentistDashboardPage from './pages/DentistDashboardPage'
import LabTechnicianDashboard from './pages/LabTechnicianDashboard'
import PracticeAdminPriorities from './pages/PracticeAdminPriorities'
import OverviewDashboardPage from './pages/OverviewDashboardPage'
import DailyPatientsPage from './pages/DailyPatientsPage'
import { ClipboardList as DailyPatientsIcon } from 'lucide-react'

import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { useAuth } from './auth/AuthContext'
import type { ComponentProps, CSSProperties } from 'react'
import { usePracticeAppearance } from './hooks/usePracticeAppearance'
// CT_CONFIGURATION_CENTER_V1
import ConfigurationCenterPage from './pages/ConfigurationCenterPage'
import MyWorkspacePreferences from './pages/MyWorkspacePreferences'
import { useWorkspacePreferences } from './hooks/useWorkspacePreferences'
import type { WorkspacePreferencesApi } from './hooks/useWorkspacePreferences'
import {
  applyTheme,
  clearTheme,
  isThemeSurface,
  readCachedTheme,
  resolveWorkspace,
} from './workspace/workspacePrefs'
import { apiRequest } from './services/api'

import PatientExperiencePage from './pages/PatientExperiencePage'
import StaffPage from './pages/StaffPage'
import PracticeSettingsPage from './pages/PracticeSettingsPage'
import AppointmentsPage from './pages/AppointmentsPage'
import type { AppointmentTab } from './pages/AppointmentsPage'

import {
  Activity,
  LayoutDashboard,
  Users,
  CalendarDays,
  CalendarPlus,
  ListOrdered,
  Stethoscope,
  Building2,
  Settings,
  UserCircle,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Menu,
  RefreshCw,
} from 'lucide-react'

import './App.css'

import './ClientSoftWhiteTheme.css'
import './ClientDashboardRecovery.css'
import './ClientUXRepairs.css'
import './PracticeWorkspaceV2.css'
import './PracticeThemeFinal.css'
import './PracticeUnifiedTheme.css'
import './PracticeComponentTheme.css'
import './PracticeCardsV4.css'
import './PracticeNavigationLayoutFix.css'
import './PracticeSlideshowSizeFix.css'
import './PracticeLogoFit.css'
import './PracticeBrandAlignment.css'
import PracticeBrandMark from './auth/PracticeBrandMark'
import './ModalWorkspace20261110.css'
import './ThemeSurfaceFix20261111.css'
import './ClientCompactDashboardAndButtons20261111.css'
import './ClientDashboardSingleScreen20261111.css'
import './ClientRequestedWorkflowPolish20261111.css'
type Section =
  | 'Laboratory'
  | 'Dashboard' | 'Daily Patients' | 'Consultations' | 'Patient Medical Records' | 'Checkout & Payments' | 'Finance' | 'Audit Log' | 'Dental Charting' | 'Clinical Imaging' | 'Orthodontics'
  | 'Dashboard' | 'Daily Patients' | 'Billing' | 'Finance' | 'Clinical Imaging' | 'Orthodontics'
  | 'Patients'
  | 'Scheduling'
  | 'Practice Settings'
  | 'Management'
  | 'Dental Practices'
  | 'Subscriptions'
  | 'Configuration Center'
  | 'My Profile'
  | 'Workspace'
  | 'Clinical Claim Corrections'

// =========================================
// MY PROFILE
// Uses the authenticated user's real details.
// =========================================

function ProfilePage({
  workspace,
  practiceDefault,
}: {
  workspace: WorkspacePreferencesApi
  practiceDefault: ComponentProps<typeof MyWorkspacePreferences>['practiceDefault']
}) {
  const { user, changePassword } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function submitPassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    if (newPassword.length < 12) {
      setError('Use at least 12 characters.')
      return
    }

    setBusy(true)

    try {
      await changePassword(currentPassword, newPassword)

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Password changed successfully.')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to change password.'
      )
    } finally {
      setBusy(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: 12,
    borderRadius: 9,
    border: '1px solid #819ca055',
    background: 'transparent',
    color: 'inherit',
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MY ACCOUNT</div>
          <h1>My Profile</h1>
          <p>View your account and update your password.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Account Information</h2>
              <p>Your authenticated staff profile</p>
            </div>

            <UserCircle size={22} />
          </div>

          <div className="check-list">
            <div><strong>Name:</strong> {user?.fullName}</div>
            <div><strong>Email:</strong> {user?.email}</div>
            <div><strong>Role:</strong> {user?.role}</div>
            <div>
              <strong>Practice:</strong>{' '}
              {user?.practiceName ?? 'Platform Administration'}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Account Security</h2>
              <p>Change your login password</p>
            </div>

            <ShieldCheck size={22} />
          </div>

          <form
            onSubmit={submitPassword}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <label htmlFor="profile-current">
              Current password
            </label>

            <input
              id="profile-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={inputStyle}
              required
            />

            <label htmlFor="profile-new">
              New password
            </label>

            <input
              id="profile-new"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
              required
            />

            <label htmlFor="profile-confirm">
              Confirm new password
            </label>

            <input
              id="profile-confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
              required
            />

            {error && <p role="alert">{error}</p>}
            {success && <p role="status">{success}</p>}

            <button
              type="submit"
              className="primary-button"
              disabled={busy}
            >
              {busy ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </section>
      </div>

      {/* Every account chooses its own theme and layout here (admins also find it in Configuration Center). */}
      <MyWorkspacePreferences
        workspace={workspace}
        practiceDefault={practiceDefault}
      />
    </>
  )
}

// =========================================
// DENTAL PRACTICES
// Existing SuperAdmin API.
// =========================================

type Practice = {
  id: string
  name: string
  isActive: boolean
}

type PracticeAdminAccount = {
  id: string
  fullName: string
  email: string
  isActive: boolean
  mustChangePassword: boolean
}

// SuperAdmin only: the parent App controls access to this page.
// The ASP.NET Core API also enforces SuperAdmin authorization.
function DentalPracticesPage() {
  const [practices, setPractices] = useState<Practice[]>([])

  // CT_SUPERADMIN_DIALOG_V1
  const { confirm, confirmationDialog } = useConfirmDialog()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  // CT_SUPERADMIN_ACCESS_V1
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null)
  const [accessError, setAccessError] = useState('')
  const [recoveryPractice, setRecoveryPractice] = useState<Practice | null>(null)
  const [recoveryAdmins, setRecoveryAdmins] = useState<PracticeAdminAccount[]>([])
  const [recoveryAdminId, setRecoveryAdminId] = useState('')
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryConfirm, setRecoveryConfirm] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')

  const [form, setForm] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    address: '',
    adminFullName: '',
    adminEmail: '',
    adminTemporaryPassword: '',
    confirmPassword: '',
  })

  function update(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  useEffect(() => {
    let cancelled = false
    apiRequest<unknown>('/platform/practices')
      .then((response) => {
        if (!Array.isArray(response)) throw new Error('Unexpected practices response.')
        const result: Practice[] = response.map((value: unknown) => {
          if (!value || typeof value !== 'object') throw new Error('Invalid practice record.')
          const row = value as Record<string, unknown>
          if (typeof row.id !== 'string' ||
              typeof row.name !== 'string' ||
              typeof row.isActive !== 'boolean') {
            throw new Error('Incomplete practice record.')
          }
          return { id: row.id, name: row.name, isActive: row.isActive }
        })
        if (!cancelled) { setPractices(result); setError('') }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load practices.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [reloadKey])


  async function changePracticeAccess(
    practice: Practice,
    activate: boolean
  ) {
    if (accessBusyId) return

    const confirmed = await confirm({
      title: activate
        ? 'Reactivate Dental Practice?'
        : 'Suspend Dental Practice?',
      message: activate
        ? `Reactivate "${practice.name}"? Its staff will be able to access CurvTab Dental again.`
        : `Are you sure you want to suspend "${practice.name}"? Its staff will lose normal system access. Patient records will remain stored securely.`,
      confirmLabel: activate
        ? 'Reactivate Practice'
        : 'Suspend Practice',
      variant: activate ? 'default' : 'danger',
    })

    if (!confirmed) return

    setAccessBusyId(practice.id)
    setAccessError('')
    setNotice('')

    try {
      await apiRequest<void>(
        `/platform/practices/${encodeURIComponent(practice.id)}/active`,
        'PATCH',
        { isActive: activate }
      )

      setNotice(
        `${practice.name} has been ${activate ? 'reactivated' : 'suspended'}.`
      )

      setLoading(true)
      setReloadKey(value => value + 1)
    } catch (cause: unknown) {
      setAccessError(
        cause instanceof Error
          ? cause.message
          : 'Unable to update practice access.'
      )
    } finally {
      setAccessBusyId(null)
    }
  }

  async function openPracticeRecovery(practice: Practice) {
    setRecoveryPractice(practice)
    setRecoveryAdmins([])
    setRecoveryAdminId('')
    setRecoveryPassword('')
    setRecoveryConfirm('')
    setRecoveryError('')
    setRecoveryLoading(true)
    try {
      const admins = await apiRequest<PracticeAdminAccount[]>(
        `/platform/practices/${encodeURIComponent(practice.id)}/administrators`
      )
      setRecoveryAdmins(admins)
      setRecoveryAdminId(admins.find(item => item.isActive)?.id ?? '')
    } catch (cause) {
      setRecoveryError(cause instanceof Error ? cause.message : 'Could not load practice administrators.')
    } finally {
      setRecoveryLoading(false)
    }
  }

  async function submitPracticeRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!recoveryPractice || !recoveryAdminId || recoveryBusy) return
    if (recoveryPassword.length < 10 || recoveryPassword.length > 128 ||
        !/[A-Z]/.test(recoveryPassword) || !/[a-z]/.test(recoveryPassword) ||
        !/[0-9]/.test(recoveryPassword)) {
      setRecoveryError('Use 10–128 characters including upper and lowercase letters and a digit.')
      return
    }
    if (recoveryPassword !== recoveryConfirm) {
      setRecoveryError('Temporary passwords do not match.')
      return
    }
    setRecoveryBusy(true)
    setRecoveryError('')
    try {
      await apiRequest<void>(
        `/platform/practices/${encodeURIComponent(recoveryPractice.id)}/administrators/${encodeURIComponent(recoveryAdminId)}/reset-password`,
        'POST',
        { temporaryPassword: recoveryPassword }
      )
      setNotice(`Administrator access reset for "${recoveryPractice.name}". Share the one-time temporary password securely; the administrator must change it at login.`)
      setRecoveryPractice(null)
      setRecoveryAdmins([])
      setRecoveryPassword('')
      setRecoveryConfirm('')
      setRecoveryAdminId('')
    } catch (cause) {
      setRecoveryError(cause instanceof Error ? cause.message : 'Unable to reset administrator password.')
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function registerPractice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setFormError('')
    setNotice('')
    const trimmedName = form.name.trim()
    const fullName = form.adminFullName.trim()
    const email = form.adminEmail.trim().toLowerCase()
    if (!trimmedName || !fullName || !email) {
      setFormError('Practice name, administrator name and administrator email are required.')
      return
    }
    if (form.adminTemporaryPassword.length < 10 ||
        !/[A-Z]/.test(form.adminTemporaryPassword) ||
        !/[a-z]/.test(form.adminTemporaryPassword) ||
        !/[0-9]/.test(form.adminTemporaryPassword)) {
      setFormError('Temporary password needs at least 10 characters, upper/lowercase letters and a digit.')
      return
    }
    if (form.adminTemporaryPassword !== form.confirmPassword) {
      setFormError('Temporary passwords do not match.')
      return
    }
    setSaving(true)
    try {
      await apiRequest<unknown>('/platform/practices', 'POST', {
        name: trimmedName,
        email: form.email.trim() || null,
        phoneNumber: form.phoneNumber.trim() || null,
        address: form.address.trim() || null,
        adminFullName: fullName,
        adminEmail: email,
        adminTemporaryPassword: form.adminTemporaryPassword,
      })
      setNotice(`${trimmedName} created. The new administrator must change their temporary password at first sign-in.`)
      setForm({ name: '', email: '', phoneNumber: '', address: '', adminFullName: '', adminEmail: '', adminTemporaryPassword: '', confirmPassword: '' })
      setShowForm(false)
      setLoading(true)
      setReloadKey((value) => value + 1)
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Unable to register the practice.')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '12px 13px', border: '1px solid #cfdded',
    borderRadius: 11, background: '#fff', color: '#213653', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 7, fontWeight: 600, fontSize: 13,
  }

  return (
    <>
      {confirmationDialog}
      <div className="page-heading">
        <div>
          <div className="eyebrow">SAAS PLATFORM</div>
          <h1>Dental Practices</h1>
          <p>Register and manage dental practices on CurvTab Dental.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="secondary-button" onClick={() => {
            setLoading(true); setReloadKey((value) => value + 1)
          }}>
            <RefreshCw size={17} /> Refresh
          </button>
          <button type="button" className="primary-button" aria-expanded={showForm}
            onClick={() => { setShowForm((value) => !value); setFormError('') }}>
            {showForm ? 'Close registration' : '+ Register Practice'}
          </button>
        </div>
      </div>

      {notice && <section className="panel" role="status" style={{ borderColor: '#a5dfc2', marginBottom: 18 }}>
        <p style={{ color: '#176b42', margin: 0 }}>{notice}</p>
      </section>}

      {showForm && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div><h2>Register a practice</h2><p>Create a practice and its first PracticeAdmin account.</p></div>
            <Building2 size={21} />
          </div>
          <form onSubmit={(event) => void registerPractice(event)} style={{ display: 'grid', gap: 18 }}>
            <h3 style={{ margin: 0 }}>Practice details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15 }}>
              <label style={labelStyle}>Practice name *
                <input style={fieldStyle} required maxLength={200} value={form.name}
                  onChange={(event) => update('name', event.target.value)} placeholder="Sunrise Dental Clinic" />
              </label>
              <label style={labelStyle}>Practice contact email
                <input style={fieldStyle} type="email" maxLength={256} value={form.email}
                  onChange={(event) => update('email', event.target.value)} placeholder="contact@example.com" />
              </label>
              <label style={labelStyle}>Contact number
                <input style={fieldStyle} type="tel" maxLength={40} value={form.phoneNumber}
                  onChange={(event) => update('phoneNumber', event.target.value)} placeholder="011 000 1234" />
              </label>
              <label style={labelStyle}>Address
                <input style={fieldStyle} maxLength={500} value={form.address}
                  onChange={(event) => update('address', event.target.value)} placeholder="City and street address" />
              </label>
            </div>
            <h3 style={{ margin: '2px 0 0' }}>First Practice Administrator</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15 }}>
              <label style={labelStyle}>Administrator full name *
                <input style={fieldStyle} required maxLength={200} value={form.adminFullName}
                  onChange={(event) => update('adminFullName', event.target.value)} placeholder="Dr Test Admin" />
              </label>
              <label style={labelStyle}>Administrator login email *
                <input style={fieldStyle} required type="email" maxLength={256} value={form.adminEmail}
                  onChange={(event) => update('adminEmail', event.target.value)} placeholder="admin@example.com" />
              </label>
              <label style={labelStyle}>Temporary password *
                <input style={fieldStyle} required type="password" minLength={10} autoComplete="new-password"
                  value={form.adminTemporaryPassword}
                  onChange={(event) => update('adminTemporaryPassword', event.target.value)} />
              </label>
              <label style={labelStyle}>Confirm temporary password *
                <input style={fieldStyle} required type="password" minLength={10} autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(event) => update('confirmPassword', event.target.value)} />
              </label>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#60748e' }}>
              The administrator will be required to change their temporary password on first login.
              Secure email invitations can replace temporary passwords in a later release.
            </p>
            {formError && <p role="alert" style={{ color: '#ad2431', margin: 0 }}>{formError}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? 'Registering...' : 'Create Practice'}
              </button>
              <button className="secondary-button" type="button" disabled={saving} onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Practice Directory</h2>
          <Building2 size={21} />
        </div>
        {loading && <p>Loading practices...</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && practices.length === 0 && <p>No practices registered yet.</p>}
        {!loading && !error && (
          <div className="ct-platform-management">
            <div className="ct-platform-summary">
              <div>
                <span>Registered Practices</span>
                <strong>{practices.length}</strong>
              </div>
              <div>
                <span>Active Practices</span>
                <strong>
                  {practices.filter(p => p.isActive).length}
                </strong>
              </div>
              <div>
                <span>Suspended Practices</span>
                <strong>
                  {practices.filter(p => !p.isActive).length}
                </strong>
              </div>
            </div>

            {accessError && (
              <p role="alert" style={{ color: '#dc3545' }}>
                {accessError}
              </p>
            )}

            <div className="ct-platform-practice-list">
              {practices.map(practice => (
                <article
                  key={practice.id}
                  className="ct-platform-practice-card"
                >
                  <div className="ct-platform-practice-details">
                    <strong>{practice.name}</strong>
                    <small>Dental practice</small>
                  </div>

                  <span className={
                    practice.isActive
                      ? 'ct-platform-status is-active'
                      : 'ct-platform-status is-suspended'
                  }>
                    {practice.isActive ? 'Active' : 'Suspended'}
                  </span>

                  <div className="ct-platform-card-actions">
                    <button
                      type="button" className="secondary-button"
                      disabled={!practice.isActive || accessBusyId !== null || loading}
                      onClick={() => void openPracticeRecovery(practice)}
                    >
                      Reset Admin Access
                    </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={accessBusyId !== null || loading}
                    onClick={() => void changePracticeAccess(
                      practice,
                      !practice.isActive
                    )}
                  >
                    {accessBusyId === practice.id
                      ? 'Updating...'
                      : practice.isActive
                        ? 'Suspend Practice'
                        : 'Reactivate Practice'}
                  </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {recoveryPractice && (
        <div className="ct-platform-recovery-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !recoveryBusy) {
              setRecoveryPractice(null)
            }
          }}>
          <section className="ct-platform-recovery-dialog"
            role="dialog" aria-modal="true" aria-labelledby="ct-admin-recovery-title">
            <header className="ct-platform-recovery-heading">
              <div>
                <small>SUPER ADMIN · ACCOUNT RECOVERY</small>
                <h2 id="ct-admin-recovery-title">Reset Practice Administrator</h2>
                <p>{recoveryPractice.name}</p>
              </div>
              <button type="button" className="secondary-button"
                disabled={recoveryBusy} onClick={() => setRecoveryPractice(null)}
                aria-label="Close administrator reset">Close</button>
            </header>
            <p className="ct-platform-recovery-note">
              Confirm the administrator's identity before resetting. Their existing practice,
              patients, invoices and records will not be recreated or changed.
              This ends existing sessions and requires a password change at next login.
            </p>
            {recoveryLoading ? <p>Loading administrators…</p> : (
              <form className="ct-platform-recovery-form" onSubmit={event => void submitPracticeRecovery(event)}>
                <label>Practice administrator
                  <select value={recoveryAdminId}
                    required onChange={event => setRecoveryAdminId(event.target.value)}>
                    <option value="">Select administrator</option>
                    {recoveryAdmins.filter(admin => admin.isActive).map(admin => (
                      <option key={admin.id} value={admin.id}>
                        {admin.fullName} ({admin.email})
                      </option>
                    ))}
                  </select>
                </label>
                {!recoveryAdmins.some(admin => admin.isActive) && (
                  <p>No active administrator found for this practice.</p>
                )}
                <label>New temporary password
                  <input type="password" autoComplete="new-password" required
                    minLength={10} maxLength={128} value={recoveryPassword}
                    onChange={event => setRecoveryPassword(event.target.value)}/>
                </label>
                <label>Confirm temporary password
                  <input type="password" autoComplete="new-password" required
                    minLength={10} maxLength={128} value={recoveryConfirm}
                    onChange={event => setRecoveryConfirm(event.target.value)}/>
                </label>
                {recoveryError && <p role="alert" className="ct-platform-recovery-error">{recoveryError}</p>}
                <p className="ct-platform-recovery-note">Use at least 10 characters including uppercase, lowercase and a digit.
                  Do not send the password through a public chat, screenshot or source code.</p>
                <div className="ct-platform-recovery-actions">
                  <button className="secondary-button" type="button" disabled={recoveryBusy}
                    onClick={() => setRecoveryPractice(null)}>Cancel</button>
                  <button className="primary-button" type="submit"
                    disabled={recoveryBusy || !recoveryAdminId}>
                    {recoveryBusy ? 'Resetting…' : 'Reset Administrator Password'}
                  </button>
                </div>
              </form>
            )}
            {!recoveryLoading && recoveryError && !recoveryAdmins.length &&
              <p role="alert" className="ct-platform-recovery-error">{recoveryError}</p>}
          </section>
        </div>
      )}
    </>
  )
}

// =========================================
// APP
// =========================================

export default function App() {
  const { user, logout } = useAuth()
  const { appearance, setAppearance } = usePracticeAppearance(user?.practiceId)
  const isModuleVisible = (name: string) => !appearance || ![
    'Patients','Scheduling','Daily Patients',
    'Billing','Clinical Imaging','Orthodontics'
  ].includes(name) || appearance.enabledModules.includes(name) ||
    (name === 'Billing' && appearance.enabledModules.includes('Checkout & Payments')) ||
    (name === 'Scheduling' && appearance.enabledModules.includes('Appointments'))

  // Share the authenticated practice theme with notification portals.
  useEffect(() => {
    const root = document.documentElement

    if (!appearance || !user?.practiceId) {
      root.removeAttribute('data-practice-theme')
      return
    }

    root.dataset.practiceTheme = 'active'
    root.style.setProperty('--ct-tenant-primary', appearance.primaryColor)
    root.style.setProperty('--ct-tenant-accent', appearance.accentColor)

    return () => {
      root.removeAttribute('data-practice-theme')
      root.style.removeProperty('--ct-tenant-primary')
      root.style.removeProperty('--ct-tenant-accent')
    }
  }, [appearance, user?.practiceId])

  const practiceThemeStyle = appearance ? ({
    '--practice-primary': appearance.primaryColor,
    '--practice-accent': appearance.accentColor,
  } as CSSProperties) : undefined

  const [section, setSection] = useState<Section>('Dashboard')
  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Sidebar Appointments submenu.
  const [financeTab, setFinanceTab] = useState<FinanceTab>('revenues')
  const [financeExpanded, setFinanceExpanded] = useState(true)
  // Sidebar Scheduling submenu.
  const [billingExpanded, setBillingExpanded] = useState(true)
  const [billingSection, setBillingSection] = useState<BillingSection>('today')
  const [appointmentsExpanded, setAppointmentsExpanded] =
    useState(false)

  const [appointmentTab, setAppointmentTab] =
    useState<AppointmentTab>('Appointments')

  // Colour theme + layout: the account's own choice, else the practice default (Configuration Center
  // > Appearance), else the built-in default. Saved on the server, so it follows the account.
  const workspace = useWorkspacePreferences(user?.id)
  const cachedTheme = useMemo(() => readCachedTheme(user?.id), [user?.id])
  const [themeOverride, setThemeOverride] = useState<ThemeSurface | null>(null)
  const [themeSaving, setThemeSaving] = useState(false)
  const [themeError, setThemeError] = useState('')
  const resolvedWorkspace = resolveWorkspace(workspace.prefs, appearance, cachedTheme)
  const effective = { ...resolvedWorkspace, themeSurface: themeOverride ?? resolvedWorkspace.themeSurface }

  useEffect(() => {
    setThemeOverride(null)
    setThemeError('')
  }, [user?.id])

  async function changeWorkspaceTheme(next: ThemeSurface) {
    if (themeSaving || !user?.id) return
    const previous = effective.themeSurface
    setThemeError('')
    setThemeOverride(next)
    applyTheme(user.id, next)
    setThemeSaving(true)
    try {
      await workspace.save({ ...workspace.prefs, themeSurface: next })
    } catch (cause) {
      setThemeOverride(previous)
      applyTheme(user.id, previous)
      setThemeError(cause instanceof Error ? cause.message : 'Unable to save theme. Please retry.')
    } finally {
      setThemeSaving(false)
    }
  }

  useEffect(() => {
    applyTheme(user?.id, effective.themeSurface)
  }, [user?.id, effective.themeSurface])

  useEffect(() => clearTheme, [])

  const navClass =
    effective.navigationMode === 'Topbar'
      ? 'ct-nav-top'
      : effective.navigationMode === 'Rail'
        ? 'ct-nav-rail'
        : 'ct-nav-sidebar'

  const role = user?.role ?? ''
  const isSuperAdmin = role === 'SuperAdmin'
  const isPracticeAdmin = role === 'PracticeAdmin'

  const canViewPatients =
    !isSuperAdmin &&
    role !== 'LabTechnician' &&
    role !== 'Finance' &&
    Boolean(user?.practiceId)

  const canManageStaff = isPracticeAdmin

  // The new overview dashboard is for front-desk and practice-admin users.
  const showOverview =
    canViewPatients && (isPracticeAdmin || role === 'Receptionist')

  // Receptionist has exactly four top-level sections.
  const navigation = isSuperAdmin
    ? [
        { name: 'Dashboard' as Section, icon: LayoutDashboard },
        { name: 'Dental Practices' as Section, icon: Building2 },
        { name: 'Subscriptions' as Section, icon: Building2 },
        { name: 'My Profile' as Section, icon: UserCircle },
      ]
    : [
        { name: 'Dashboard' as Section, icon: LayoutDashboard },
        ...(canViewPatients
          ? [
              { name: 'Scheduling' as Section, icon: CalendarDays },
              { name: 'Patients' as Section, icon: Users },
              { name: 'Laboratory' as Section, icon: FlaskConical },
            ]
          : []),
        ...(canManageStaff
          ? [
              { name: 'Management' as Section, icon: CtManagementIcon },
            ]
          : []),
        ...(canManageStaff ? [{ name: 'Configuration Center' as Section, icon: CtAppearanceIcon }] : []),
        // CT_LAB_TECH_NAV
        ...(role === 'LabTechnician' ? [{ name: 'Laboratory' as Section, icon: FlaskConical }] : []),
        { name: 'Workspace' as Section, icon: CtManagementIcon },
        { name: 'My Profile' as Section, icon: UserCircle },
      ]

  const dashboardTitles: Record<string, string> = {
    SuperAdmin: 'Platform Administration',
    PracticeAdmin: 'Practice Management',
    Receptionist: 'Front Desk Workspace',
    Dentist: 'Clinical Workspace',
  }

  const dashboardTitle =
    dashboardTitles[role] ?? 'CurvTab Dental Workspace'

  // Existing Patients, Scheduling, Laboratory and Configuration screens already own their dialogs.
  const useModulePopup = !['Dashboard', 'Patients', 'Scheduling', 'Laboratory', 'Configuration Center'].includes(section)

  const initials =
    user?.fullName
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => name.charAt(0).toUpperCase())
      .join('') || 'CT'

  function navigate(target: Section) {
    setSection(target)
    if (target !== 'Patients') setSelectedConsultationId(null)
    setMenuOpen(false)

    if (target === 'Scheduling') {
      setAppointmentsExpanded(true)
    }
  }

  function openAppointmentTab(tab: AppointmentTab) {
    setAppointmentTab(tab)
    setAppointmentsExpanded(true)
    navigate('Scheduling')
  }

  return (
    <div className={`app-shell ${appearance ? `ct-layout-${effective.layoutPreset.toLowerCase()} ${navClass}` : ''}`}
      data-practice-branded={appearance ? 'true' : undefined}
      style={practiceThemeStyle}>

      {/* MOBILE OVERLAY */}
      {menuOpen && (
        <button
          type="button"
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* ================================
          SIDEBAR
          ================================ */}
      <aside
        className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}
      >
        <div className="brand">
          <div className="brand-icon">
            {/* WORKSPACE LOGO FIX */}
            <PracticeBrandMark
              src={appearance?.logoUrl || appearance?.badgeUrl}
              alt={appearance?.displayName || user?.practiceName || 'Dental practice'}
              fallback={<Activity size={25} />}
            />
          </div>

          <div>
            <strong>{appearance?.displayName || (user?.practiceName ?? 'CurvTab Dental')}</strong>
            <span></span>
          </div>
        </div>

        <div className="practice-chip">
          <Building2 size={18} />

          <div>
            <strong>
              {user?.practiceName ?? 'Platform administration'}
            </strong>
            <span>{user?.role ?? 'Staff member'}</span>
          </div>
        </div>

        <p className="nav-heading">WORKSPACE</p>

        <nav
          className="side-nav"
          aria-label="Main navigation"
         style={{ display: 'flex', flexDirection: 'column' }}>
          {navigation.filter(item => isModuleVisible(item.name) &&
             !((role === 'Receptionist' || role === 'PracticeAdmin') &&
               ['Laboratory','Management','Configuration Center'].includes(item.name))).map((item) => {
            const Icon = item.icon

            if (item.name === 'Scheduling') {
              return (
                <div key="Appointments" className="nav-group-wrap">
                  {/* Expand/collapse the Scheduling submenu */}
                  <button
                    type="button"
                    className={
                      section === 'Scheduling'
                        ? 'nav-item nav-group nav-group-active'
                        : 'nav-item nav-group'
                    }
                    // Only opens/closes the submenu. The pages are the items inside it.
                    onClick={() => setAppointmentsExpanded((value) => !value)}
                    aria-expanded={appointmentsExpanded}
                  >
                    <Icon size={19} />
                    <span>Scheduling</span>
                    {appointmentsExpanded
                      ? <ChevronDown size={16} />
                      : <ChevronRight size={16} />
                    }
                  </button>

                  {(
                    <div
                      className={'nav-submenu' + (appointmentsExpanded ? '' : ' nav-submenu-collapsed')}
                      style={{
                        paddingLeft: 21,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        margin: '5px 0 12px',
                      }}
                    >
                      {([
                        {
                          name: 'Appointments' as AppointmentTab,
                          icon: CalendarPlus,
                        },
                        {
                          name: 'In Queue' as AppointmentTab,
                          icon: ListOrdered,
                        },
                      ]).map((subItem) => {
                        const SubIcon = subItem.icon
                        const selected =
                          section === 'Scheduling' &&
                          appointmentTab === subItem.name

                        return (
                          <button
                            type="button"
                            key={subItem.name}
                            className={
                              selected
                                ? 'nav-item nav-active'
                                : 'nav-item'
                            }
                            onClick={() =>
                              openAppointmentTab(subItem.name)
                            }
                            aria-current={
                              selected ? 'page' : undefined
                            }
                          >
                            <SubIcon size={16} />
                            <span>{subItem.name}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <button
                type="button"
                key={item.name}
                style={{ order: item.name === 'My Profile' ? 999 : 0 }}
                data-profile-nav={item.name === 'My Profile' ? 'true' : undefined}
                className={
                  section === item.name
                    ? 'nav-item nav-active'
                    : 'nav-item'
                }
                onClick={() => navigate(item.name)}
              >
                <Icon size={19} />
                <span>{item.name === 'Finance' ? 'Finances' : item.name}</span>
              </button>
            )
          })}
          {role === 'Dentist' && isModuleVisible('Daily Patients') && (
            <button
              type="button"
              className={section === 'Daily Patients' ? 'nav-item nav-active' : 'nav-item'}
              onClick={() => navigate('Daily Patients')}
            >
              <DailyPatientsIcon size={19} />
              <span>Daily Patients</span>
            </button>
          )}
          
{/* Consultations are opened from Daily Patients */}

          {/* Client guide: one Billing parent, exactly five named children. */}
          {(role === 'Receptionist' || role === 'PracticeAdmin') && isModuleVisible('Billing') && (
            <div className="ct-guide-sidebar-group nav-group-wrap">
              <button type="button"
                className={section === 'Billing' ? 'nav-item nav-group nav-group-active' : 'nav-item nav-group'}
                aria-expanded={billingExpanded}
                // Only opens/closes the submenu. The pages are the items inside it.
                onClick={() => setBillingExpanded(open => !open)}>
                <RandIcon size={19}/><span>Billing</span>
                {billingExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
              </button>
              {(
                <div className={'ct-guide-sidebar-items nav-submenu' + (billingExpanded ? '' : ' nav-submenu-collapsed')}>
                  {([
                    ['today', "Today's Billing"],
                    ['cashPrivate', 'Cash & Private'],
                    ['medicalAid', 'Medical Aid'],
                    ['dayClose', 'Day Close'],
                  ] as const).map(([id, name]) => (
                    <button key={id} type="button"
                      className={section === 'Billing' && billingSection === id ? 'nav-item nav-active' : 'nav-item'}
                      aria-current={section === 'Billing' && billingSection === id ? 'page' : undefined}
                      onClick={() => { setBillingSection(id);navigate('Billing');setBillingExpanded(true) }}>
                      <span>{name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {(role === 'PracticeAdmin' || role === 'Finance') && (
            <div className="nav-group-wrap">
              <button type="button"
                className={section === 'Finance' ? 'nav-item nav-group nav-group-active' : 'nav-item nav-group'}
                aria-expanded={financeExpanded}
                // Only opens/closes the submenu. The pages are the items inside it.
                onClick={() => setFinanceExpanded(value => !value)}>
                <Wallet size={19} /> <span>Finances</span>
                {financeExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {(
                <div className={'nav-submenu' + (financeExpanded ? '' : ' nav-submenu-collapsed')} style={{ paddingLeft: 21, display: 'flex', flexDirection: 'column', gap: 4, margin: '5px 0 12px' }}>
                  {([['revenues', 'Revenues'], ['expenses', 'Expenses']] as const).map(([id, label]) => (
                    <button type="button" key={id}
                      className={section === 'Finance' && financeTab === id ? 'nav-item nav-active' : 'nav-item'}
                      aria-current={section === 'Finance' && financeTab === id ? 'page' : undefined}
                      onClick={() => { setFinanceTab(id); setSection('Finance'); setMenuOpen(false) }}>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {(role === 'Receptionist' || role === 'PracticeAdmin') && (
            <button type="button" className={section === 'Laboratory' ? 'nav-item nav-active' : 'nav-item'}
              onClick={() => navigate('Laboratory')}><FlaskConical size={19}/><span>Lab</span></button>
          )}
          {role === 'PracticeAdmin' && (
            <button type="button" className={section === 'Management' ? 'nav-item nav-active' : 'nav-item'}
              onClick={() => navigate('Management')}><CtManagementIcon size={19}/><span>Staff Management</span></button>
          )}
          {role === 'PracticeAdmin' && (
            <button type="button" className={section === 'Configuration Center' ? 'nav-item nav-active' : 'nav-item'}
              onClick={() => navigate('Configuration Center')}><CtAppearanceIcon size={19}/><span>Configuration Center</span></button>
          )}
          {role === 'PracticeAdmin' && (
            <button type="button"
              className={section === 'Audit Log' ? 'nav-item nav-active' : 'nav-item'}
              onClick={() => navigate('Audit Log')}>
              <DailyPatientsIcon size={19} /> <span>Audit Log</span>
            </button>
          )}
          {role === 'Dentist' && (
            <>
              {/* Dental Charting is opened from a patient's record */}
              {isModuleVisible('Clinical Imaging') && (
                <button
                  type="button"
                  className={
                    section === 'Clinical Imaging'
                      ? 'nav-item nav-active'
                      : 'nav-item'
                  }
                  onClick={() => navigate('Clinical Imaging')}
                >
                  <ClinicalImagingIcon size={19} />
                  <span>Clinical Imaging</span>
                </button>
              )}
              <button type="button"
                className={section === 'Clinical Claim Corrections' ? 'nav-item nav-active' : 'nav-item'}
                onClick={() => navigate('Clinical Claim Corrections')}>
                <ShieldCheck size={19}/><span>Claim Corrections</span>
              </button>
              {isModuleVisible('Orthodontics') && <button type="button"
                className={section === 'Orthodontics' ? 'nav-item nav-active' : 'nav-item'}
                onClick={() => navigate('Orthodontics')}>
                <Stethoscope size={19} /><span>Orthodontics</span>
              </button>}
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-note">
            <ShieldCheck size={20} />
            <div>
              {/* <strong>Secure foundation</strong>
              <span>Authenticated practice access</span> */}
            </div>
          </div>

          {/* <p>CurvTab Dental 2.0</p> */}
        </div>
      </aside>

      {/* ================================
          MAIN WORKSPACE
          ================================ */}
      <div className="workspace">

        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button mobile-menu"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            <div className="breadcrumb">
              <span>Workspace</span>
              <span>/</span>
              <strong>{section}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <label className="ct-theme-topbar-label" htmlFor="ct-workspace-theme">Theme</label>
            <select
              id="ct-workspace-theme"
              className="ct-theme-select"
              aria-label="Workspace colour theme"
              value={effective.themeSurface}
              onChange={event => void changeWorkspaceTheme(event.target.value as ThemeSurface)}
              disabled={themeSaving}
            >
              <option value="white">White Only</option>
              <option value="blue">Blue &amp; White</option>
              <option value="dark">Dark Blue</option>
            </select>
            {themeError && <span role="alert" className="ct-theme-save-error" title={themeError}>Theme not saved</span>}
            <LiveClinicNotifications
              role={role}
              onOpen={() => {
                if (role === 'Dentist') openAppointmentTab('In Queue')
                else navigate('Billing')
              }}
            />

            <div className="avatar">{initials}</div>

            <div className="topbar-user">
              <strong>{user?.fullName}</strong>
              <span>{user?.role}</span>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        </header>

        {useModulePopup && (
          <button
            type="button"
            className="ct-module-backdrop"
            aria-label={`Close ${section} workspace`}
            onClick={() => navigate('Dashboard')}
          />
        )}
        <main
          className={`main-content${useModulePopup ? ' ct-module-popup-window' : ''}`}
          role={useModulePopup ? 'dialog' : undefined}
          aria-modal={useModulePopup ? true : undefined}
          aria-label={useModulePopup ? `${section} workspace` : undefined}
        >
          {useModulePopup && (
            <header className="ct-module-popup-toolbar">
              <div>
                <span className="ct-module-popup-eyebrow">CURVTAB DENTAL · WORKSPACE</span>
                <strong>{section}</strong>
              </div>
              <button type="button" className="ct-module-popup-close"
                onClick={() => navigate('Dashboard')} aria-label={`Close ${section}`}>
                <span aria-hidden="true">×</span> Close
              </button>
            </header>
          )}

          {/* ================================
              DASHBOARD
              ================================ */}
          {section === 'Dashboard' && role === 'Dentist' && (
            <DentistDashboardPage
              onOpenAppointments={() => openAppointmentTab('In Queue')}
              onOpenDailyPatients={() => navigate('Daily Patients')}
            />
          )}
          {/* Keep the client's original dental slideshow at the top.
              Compact live reports appear directly beneath its KPI row. */}
          {section === 'Dashboard' && role === 'LabTechnician' && (
            <LabTechnicianDashboard onOpenLaboratory={() => navigate('Laboratory')} />
          )}
          {section === 'Dashboard' && role !== 'Dentist' && role !== 'LabTechnician' && (
            <ClinicDashboardEnhancements
              role={role}
              showActivityCharts={!showOverview}
              showKpis={!showOverview}
              onPrimaryAction={() => {
                if (role === 'SuperAdmin') navigate('Dental Practices')
                else openAppointmentTab('Appointments')
              }}
            />
          )}
          {section === 'Dashboard' && isPracticeAdmin && (
            <PracticeAdminPriorities
              onDayClose={() => { setBillingSection('dayClose'); navigate('Billing'); setBillingExpanded(true) }}
              onStaff={() => navigate('Management')}
              onLaboratory={() => navigate('Laboratory')}
              onScheduling={() => openAppointmentTab('Appointments')}
            />
          )}
          {section === 'Dashboard' && showOverview && (
            <OverviewDashboardPage
              fullName={user?.fullName ?? ''}
              practiceName={user?.practiceName ?? null}
              onNewAppointment={() => openAppointmentTab('Appointments')}
              onOpenQueue={() => openAppointmentTab('In Queue')}
              onOpenCheckout={() => navigate('Billing')}
              onOpenPatients={() => navigate('Patients')}
            />
          )}

          {section === 'Dashboard' && role !== 'Dentist' && role !== 'LabTechnician' && !showOverview && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {role.toUpperCase() || 'WORKSPACE'}
                  </div>

                  <h1>{dashboardTitle}</h1>

                  <p>
                    Welcome, {user?.fullName}.
                    {' '}
                    {isSuperAdmin
                      ? 'Manage dental practices on the platform.'
                      : 'Access your authorised dental practice tools.'}
                  </p>
                </div>
              </div>

              <div className="stats-grid">
                {isSuperAdmin ? (
                  <article className="stat-card">
                    <div className="stat-top">
                      <span>Dental Practices</span>
                      <div className="stat-icon">
                        <Building2 size={19} />
                      </div>
                    </div>

                    <p>Manage registered dental practices.</p>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => navigate('Dental Practices')}
                    >
                      Open Practices
                      <ArrowRight size={16} />
                    </button>
                  </article>
                ) : (
                  <>
                    {canViewPatients && (
                      <article className="stat-card">
                        <div className="stat-top">
                          <span>Patients</span>
                          <div className="stat-icon">
                            <Users size={19} />
                          </div>
                        </div>

                        <p>Search and view patient records.</p>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => navigate('Patients')}
                        >
                          Open Patients
                          <ArrowRight size={16} />
                        </button>
                      </article>
                    )}

                    {canViewPatients && (
                      <article className="stat-card">
                        <div className="stat-top">
                          <span>Appointments</span>
                          <div className="stat-icon">
                            <CalendarDays size={19} />
                          </div>
                        </div>

                        <p>Open the calendar and choose a date.</p>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => openAppointmentTab('Appointments')}
                        >
                          Open Calendar
                          <ArrowRight size={16} />
                        </button>
                      </article>
                    )}

                    {canManageStaff && (
                      <article className="stat-card">
                        <div className="stat-top">
                          <span>Staff Management</span>
                          <div className="stat-icon">
                            <Settings size={19} />
                          </div>
                        </div>

                        <p>Manage your practice employees.</p>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => navigate('Management')}
                        >
                          Manage Staff
                          <ArrowRight size={16} />
                        </button>
                      </article>
                    )}
                  </>
                )}
              </div>

              <section
                className="panel"
                style={{ marginTop: 20 }}
              >
                <div className="panel-header">
                  <div>
                    <h2>My Workspace</h2>
                    <p>Quick access to your profile</p>
                  </div>

                  <Stethoscope size={21} />
                </div>

                <p>
                  Signed in as <strong>{user?.fullName}</strong>
                  {' '}({user?.role})
                </p>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => navigate('My Profile')}
                >
                  View My Profile
                  <ArrowRight size={16} />
                </button>
              </section>
            </>
          )}

          {/* DENTIST DAILY PATIENTS */}
          {section === 'Daily Patients' && role === 'Dentist' && (
            <DailyPatientsPage
              onOpenPatients={() => navigate('Patients')}
              onOpenConsultation={(appointmentId) => {
                setSelectedConsultationId(appointmentId)
                navigate('Patients')
              }}
            />
          )}

          {/* PATIENTS */}
          {/* CT_PATIENT_SCOPED_CONSULTATIONS_20261110 */}
          {section === 'Patients' && canViewPatients && (
            <PatientExperiencePage
              role={role}
              onClose={() => navigate('Dashboard')}
              onOpenAppointments={() => openAppointmentTab('Appointments')}
              initialConsultationAppointmentId={selectedConsultationId}
              onConsultationOpened={() => setSelectedConsultationId(null)}
            />
          )}

          {/* APPOINTMENTS + EXPANDABLE WORKSPACE */}
          {section === 'Scheduling' && canViewPatients && (
            <AppointmentsPage
              onClose={() => navigate('Dashboard')}
              tab={appointmentTab}
              onTabChange={setAppointmentTab}
              onOpenPatients={() => navigate('Patients')}
              onOpenConsultation={(appointmentId) => {
                setSelectedConsultationId(appointmentId)
                navigate('Patients')
              }}
              role={role}
            />
          )}

          {section === 'Clinical Claim Corrections' && role === 'Dentist' && <ClinicalClaimCorrectionsPage />}

          {section === 'Workspace' && !isSuperAdmin && <EmployeeWorkspacePage onManageStaff={isPracticeAdmin ? () => navigate('Management') : undefined} />}

          {/* STAFF MANAGEMENT */}
          {section === 'Management' && canManageStaff && (
            <StaffPage />
          )}

          {/* SAAS PLATFORM PRACTICES */}
          {section === 'Subscriptions' && isSuperAdmin && (
            <PlatformSubscriptionsPage />
          )}
          {section === 'Dental Practices' && isSuperAdmin && (
            <DentalPracticesPage />
          )}

          {/* PHASE 3: RECEPTIONIST CHECKOUT */}
          {section === 'Billing' &&
            (role === 'Receptionist' || role === 'PracticeAdmin') && (
              <BillingWorkspaceTabs
                section={billingSection}
                onSectionChange={setBillingSection}
                isManager={role === 'PracticeAdmin'}
                checkout={<ReceptionCheckoutPage />}
                ledger={<BillingLedgerPanel />}
                plans={<PlanAccountsPanel />}
                medicalAid={<MedicalAidPanel canManage={role === 'PracticeAdmin'} />}
                balances={<PatientBalancesPanel />}
                invoices={<InvoicesPanel canIssue={role === 'PracticeAdmin'} />}
              />
          )}

          {section === 'Audit Log' && role === 'PracticeAdmin' && <AuditLogPage />}

          {/* FINANCE MODULE: revenues and expenses */}
          {section === 'Finance' &&
            (role === 'Finance' || role === 'PracticeAdmin') && (
              <FinanceWorkspaceTabs
                tab={financeTab}
                onTab={setFinanceTab}
                revenues={<BillingLedgerPanel />}
                expenses={
                  <FinanceOperationsPanel
                    canManage={role === 'PracticeAdmin'}
                  />
                }
              />
          )}

          {/* PHASE 4/5: DENTIST SPECIALTIES */}
          {section === 'Laboratory' && role !== 'SuperAdmin' && (
  <div
    className="ct-lab-floating-overlay"
    role="presentation"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        navigate('Dashboard')
      }
    }}
  >
    {/* CT_LAB_FLOATING_POPUP_V1 */}
    <section
      className="ct-lab-floating-window"
      role="dialog"
      aria-modal="true"
      aria-label="Laboratory"
    >
      <div className="ct-lab-floating-toolbar">
        <div>
          <strong>Laboratory</strong>
          <small>Orders, dispatch, deliveries and clinical outcomes</small>
        </div>

        <button
          type="button"
          className="ct-lab-floating-close"
          aria-label="Close Laboratory"
          onClick={() => navigate('Dashboard')}
        >
          ×
        </button>
      </div>

      <div className="ct-lab-floating-content">
        <LaboratoryModule />
      </div>
    </section>
  </div>
)}
          {section === 'Clinical Imaging' && role === 'Dentist' && (
            <ClinicalImagingPage />
          )}
          {section === 'Orthodontics' && role === 'Dentist' && <OrthodonticsPage />}

          {/* PRACTICE SETTINGS — ONLY PracticeAdmin */}
          {section === 'Practice Settings' && canManageStaff && (
            <>
              <PracticeSettingsPage onOpenStaff={() => navigate('Management')} />
              <WhatsAppPanel />
            </>
          )}

          {/* PRACTICE ADMIN: WHITE-LABEL APPEARANCE */}
          {section === 'Configuration Center' && isPracticeAdmin && appearance && (
            <ConfigurationCenterPage
              appearance={appearance}
              onSaved={setAppearance}
              workspace={workspace}
              onClose={() => navigate('Dashboard')}
              onOpenStaff={() => navigate('Management')}
            />
          )}

          {/* PROFILE FOR ALL ROLES */}
          {section === 'My Profile' && (
            <ProfilePage
              workspace={workspace}
              practiceDefault={
                appearance
                  ? {
                      themeSurface: isThemeSurface(appearance.themeSurface)
                        ? appearance.themeSurface
                        : 'blue',
                      layoutPreset: appearance.layoutPreset,
                      navigationMode: appearance.navigationMode,
                    }
                  : null
              }
            />
          )}

          {/* DENIED SECTIONS */}
          {(
            (section === 'Workspace' && isSuperAdmin) ||
            (section === 'Clinical Claim Corrections' && role !== 'Dentist') ||
            (section === 'Clinical Imaging' && role !== 'Dentist') ||
            (section === 'Orthodontics' && role !== 'Dentist') ||
            (section === 'Billing' && role !== 'Receptionist' && role !== 'PracticeAdmin') ||
            (section === 'Finance' && role !== 'Finance' && role !== 'PracticeAdmin') ||
            (section === 'Daily Patients' && role !== 'Dentist') ||
            (section === 'Patients' && !canViewPatients) ||
            (section === 'Scheduling' && !canViewPatients) ||
            (section === 'Management' && !canManageStaff) ||
            (section === 'Practice Settings' && !canManageStaff) ||
            (section === 'Configuration Center' && !isPracticeAdmin) ||
            (section === 'Dental Practices' && !isSuperAdmin)
          ) && (
            <section className="panel empty-panel">
              <ShieldCheck size={30} />
              <h2>Access restricted</h2>
              <p>
                Your account is not authorised to
                access this workspace.
              </p>

              <button
                type="button"
                className="secondary-button"
                onClick={() => navigate('Dashboard')}
              >
                Return to Dashboard
              </button>
            </section>
          )}

        </main>
      </div>
    </div>
  )
}
