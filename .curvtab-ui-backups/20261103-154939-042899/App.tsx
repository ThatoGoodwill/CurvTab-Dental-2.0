import LiveClinicNotifications from './components/LiveClinicNotifications'
import ClinicDashboardEnhancements from './components/ClinicDashboardEnhancements'
import './CurvTabVisualUpgrade.css'
import DentalChartingPage from './pages/DentalChartingPage'
import OrthodonticsPage from './pages/OrthodonticsPage'
import ReceptionCheckoutPage from './pages/ReceptionCheckoutPage'
import { Receipt as CheckoutIcon } from 'lucide-react'
import DentistDashboardPage from './pages/DentistDashboardPage'
import DentistConsultationsPage from './pages/DentistConsultationsPage'
import DentistMedicalRecordsPage from './pages/DentistMedicalRecordsPage'
import DailyPatientsPage from './pages/DailyPatientsPage'
import { ClipboardList as DailyPatientsIcon } from 'lucide-react'

import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { useAuth } from './auth/AuthContext'
import { apiRequest } from './services/api'

import PatientsPage from './pages/PatientsPage'
import StaffPage from './pages/StaffPage'
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
  Sun,
  Moon,
  Menu,
  RefreshCw,
} from 'lucide-react'

import './App.css'

type Section =
  | 'Dashboard' | 'Daily Patients' | 'Consultations' | 'Patient Medical Records' | 'Checkout & Payments' | 'Dental Charting' | 'Orthodontics'
  | 'Patients'
  | 'Appointments'
  | 'Management'
  | 'Dental Practices'
  | 'My Profile'

// =========================================
// MY PROFILE
// Uses the authenticated user's real details.
// =========================================

function ProfilePage() {
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

function DentalPracticesPage() {
  const [practices, setPractices] = useState<Practice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    apiRequest<unknown>('/platform/practices')
      .then((result) => {
        if (!Array.isArray(result)) {
          throw new Error('Unexpected practices response.')
        }

        const parsed = result.map((row: unknown) => {
          if (!row || typeof row !== 'object') {
            throw new Error('Invalid practice record.')
          }

          const item = row as Record<string, unknown>

          if (
            typeof item.id !== 'string' ||
            typeof item.name !== 'string' ||
            typeof item.isActive !== 'boolean'
          ) {
            throw new Error('Incomplete practice record.')
          }

          return {
            id: item.id,
            name: item.name,
            isActive: item.isActive,
          }
        })

        if (!cancelled) {
          setPractices(parsed)
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load practices.'
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SAAS PLATFORM</div>
          <h1>Dental Practices</h1>
          <p>Registered practices on CurvTab Dental.</p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setLoading(true)
            setReloadKey((value) => value + 1)
          }}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Practice Directory</h2>
          <Building2 size={21} />
        </div>

        {loading && <p>Loading practices...</p>}
        {error && <p role="alert">{error}</p>}

        {!loading && !error && practices.length === 0 && (
          <p>No practices registered yet.</p>
        )}

        {!loading && !error && (
          <div className="check-list">
            {practices.map((practice) => (
              <div key={practice.id}>
                <strong>{practice.name}</strong>
                {' — '}
                {practice.isActive ? 'Active' : 'Inactive'}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

// =========================================
// APP
// =========================================

export default function App() {
  const { user, logout } = useAuth()

  const [section, setSection] = useState<Section>('Dashboard')
  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null)
  const [medicalRecordPatientId, setMedicalRecordPatientId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Sidebar Appointments submenu.
  const [appointmentsExpanded, setAppointmentsExpanded] =
    useState(false)

  const [appointmentTab, setAppointmentTab] =
    useState<AppointmentTab>('Scheduling')

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('curvtab-theme') === 'dark'
  )

  useEffect(() => {
    document.documentElement.dataset.theme =
      darkMode ? 'dark' : 'light'

    localStorage.setItem(
      'curvtab-theme',
      darkMode ? 'dark' : 'light'
    )
  }, [darkMode])

  const role = user?.role ?? ''
  const isSuperAdmin = role === 'SuperAdmin'
  const isPracticeAdmin = role === 'PracticeAdmin'

  const canViewPatients =
    !isSuperAdmin &&
    Boolean(user?.practiceId)

  const canManageStaff = isPracticeAdmin

  // Receptionist has exactly four top-level sections.
  const navigation = isSuperAdmin
    ? [
        { name: 'Dashboard' as Section, icon: LayoutDashboard },
        { name: 'Dental Practices' as Section, icon: Building2 },
        { name: 'My Profile' as Section, icon: UserCircle },
      ]
    : [
        { name: 'Dashboard' as Section, icon: LayoutDashboard },
        ...(canViewPatients
          ? [
              { name: 'Patients' as Section, icon: Users },
              { name: 'Appointments' as Section, icon: CalendarDays },
            ]
          : []),
        ...(canManageStaff
          ? [
              { name: 'Management' as Section, icon: Settings },
            ]
          : []),
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

  const initials =
    user?.fullName
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => name.charAt(0).toUpperCase())
      .join('') || 'CT'

  function navigate(target: Section) {
    setSection(target)
    setMenuOpen(false)

    if (target === 'Appointments') {
      setAppointmentsExpanded(true)
    }
  }

  function openAppointmentTab(tab: AppointmentTab) {
    setAppointmentTab(tab)
    setAppointmentsExpanded(true)
    navigate('Appointments')
  }

  return (
    <div className="app-shell">

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
            <Activity size={25} />
          </div>

          <div>
            <strong>CurvTab Dental</strong>
            <span>Practice Management</span>
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
          {navigation.map((item) => {
            const Icon = item.icon

            if (item.name === 'Appointments') {
              return (
                <div key="Appointments">
                  {/* Expand/collapse the Appointments submenu */}
                  <button
                    type="button"
                    className={
                      section === 'Appointments'
                        ? 'nav-item nav-active'
                        : 'nav-item'
                    }
                    onClick={() => {
                      setSection('Appointments')
                      setAppointmentsExpanded((value) => !value)
                      setMenuOpen(false)
                    }}
                    aria-expanded={appointmentsExpanded}
                  >
                    <Icon size={19} />
                    <span>Appointments</span>
                    {appointmentsExpanded
                      ? <ChevronDown size={16} />
                      : <ChevronRight size={16} />
                    }
                  </button>

                  {appointmentsExpanded && (
                    <div
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
                          name: 'Scheduling' as AppointmentTab,
                          icon: CalendarPlus,
                        },
                        {
                          name: 'In Queue' as AppointmentTab,
                          icon: ListOrdered,
                        },
                      ]).map((subItem) => {
                        const SubIcon = subItem.icon
                        const selected =
                          section === 'Appointments' &&
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
                <span>{item.name}</span>
              </button>
            )
          })}
          {role === 'Dentist' && (
            <button
              type="button"
              className={section === 'Daily Patients' ? 'nav-item nav-active' : 'nav-item'}
              onClick={() => navigate('Daily Patients')}
            >
              <DailyPatientsIcon size={19} />
              <span>Daily Patients</span>
            </button>
          )}
          {role === 'Dentist' && (
            <>
              <button type="button"
                className={section === 'Consultations' ? 'nav-item nav-active' : 'nav-item'}
                onClick={() => navigate('Consultations')}>
                <Stethoscope size={19} /> <span>Consultations</span>
              </button>
              <button type="button"
                className={section === 'Patient Medical Records' ? 'nav-item nav-active' : 'nav-item'}
                onClick={() => navigate('Patient Medical Records')}>
                <DailyPatientsIcon size={19} /> <span>Patient Medical Records</span>
              </button>
            </>
          )}
          {(role === 'Receptionist' || role === 'PracticeAdmin') && (
            <button type="button"
              className={section === 'Checkout & Payments' ? 'nav-item nav-active' : 'nav-item'}
              onClick={() => navigate('Checkout & Payments')}>
              <CheckoutIcon size={19} /> <span>Checkout &amp; Payments</span>
            </button>
          )}
          {role === 'Dentist' && (
            <>
              <button type="button"
                className={section === 'Dental Charting' ? 'nav-item nav-active' : 'nav-item'}
                onClick={() => navigate('Dental Charting')}>
                <Activity size={19} /><span>Dental Charting</span>
              </button>
              <button type="button"
                className={section === 'Orthodontics' ? 'nav-item nav-active' : 'nav-item'}
                onClick={() => navigate('Orthodontics')}>
                <Stethoscope size={19} /><span>Orthodontics</span>
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Secure foundation</strong>
              <span>Authenticated practice access</span>
            </div>
          </div>

          <p>CurvTab Dental 2.0</p>
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
            <button
              type="button"
              className="icon-button"
              onClick={() => setDarkMode((value) => !value)}
              aria-label="Toggle dark mode"
            >
              {darkMode
                ? <Sun size={20} />
                : <Moon size={20} />
              }
            </button>

            <LiveClinicNotifications
              role={role}
              onOpen={() => {
                if (role === 'Dentist') openAppointmentTab('In Queue')
                else navigate('Checkout & Payments')
              }}
            />

            <div className="avatar">{initials}</div>

            <button
              type="button"
              className="secondary-button"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="main-content">
          {/* Visual upgrade: slideshow and real-data appointment analytics. */}
          {section === 'Dashboard' && (
            <ClinicDashboardEnhancements
              role={role}
              onPrimaryAction={() => {
                if (role === 'SuperAdmin') navigate('Dental Practices')
                else openAppointmentTab('Scheduling')
              }}
            />
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
          {section === 'Dashboard' && role !== 'Dentist' && (
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
                          onClick={() => openAppointmentTab('Scheduling')}
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

          {/* PHASE 2: DENTIST CLINICAL RECORDS */}
          {section === 'Consultations' && role === 'Dentist' && (
            <DentistConsultationsPage
              selectedAppointmentId={selectedConsultationId}
              onSelectAppointment={setSelectedConsultationId}
              onOpenMedicalHistory={(patientId) => {
                setMedicalRecordPatientId(patientId)
                navigate('Patient Medical Records')
              }}
            />
          )}
          {section === 'Patient Medical Records' && role === 'Dentist' && (
            <DentistMedicalRecordsPage
              selectedPatientId={medicalRecordPatientId}
              onSelectPatient={setMedicalRecordPatientId}
            />
          )}

          {/* DENTIST DAILY PATIENTS */}
          {section === 'Daily Patients' && role === 'Dentist' && (
            <DailyPatientsPage
              onOpenPatients={() => navigate('Patients')}
              onOpenConsultation={(appointmentId) => {
                setSelectedConsultationId(appointmentId)
                navigate('Consultations')
              }}
            />
          )}

          {/* PATIENTS */}
          {section === 'Patients' && canViewPatients && (
            <PatientsPage />
          )}

          {/* APPOINTMENTS + EXPANDABLE WORKSPACE */}
          {section === 'Appointments' && canViewPatients && (
            <AppointmentsPage
              tab={appointmentTab}
              onTabChange={setAppointmentTab}
              onOpenPatients={() => navigate('Patients')}
              role={role}
            />
          )}

          {/* STAFF MANAGEMENT */}
          {section === 'Management' && canManageStaff && (
            <StaffPage />
          )}

          {/* SAAS PLATFORM PRACTICES */}
          {section === 'Dental Practices' && isSuperAdmin && (
            <DentalPracticesPage />
          )}

          {/* PHASE 3: RECEPTIONIST CHECKOUT */}
          {section === 'Checkout & Payments' &&
            (role === 'Receptionist' || role === 'PracticeAdmin') && (
              <ReceptionCheckoutPage />
          )}

          {/* PHASE 4/5: DENTIST SPECIALTIES */}
          {section === 'Dental Charting' && role === 'Dentist' && <DentalChartingPage />}
          {section === 'Orthodontics' && role === 'Dentist' && <OrthodonticsPage />}

          {/* PROFILE FOR ALL ROLES */}
          {section === 'My Profile' && (
            <ProfilePage />
          )}

          {/* DENIED SECTIONS */}
          {(
            (section === 'Consultations' && role !== 'Dentist') ||
            (section === 'Patient Medical Records' && role !== 'Dentist') ||
            (section === 'Dental Charting' && role !== 'Dentist') ||
            (section === 'Orthodontics' && role !== 'Dentist') ||
            (section === 'Checkout & Payments' && role !== 'Receptionist' && role !== 'PracticeAdmin') ||
            (section === 'Daily Patients' && role !== 'Dentist') ||
            (section === 'Patients' && !canViewPatients) ||
            (section === 'Appointments' && !canViewPatients) ||
            (section === 'Management' && !canManageStaff) ||
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
