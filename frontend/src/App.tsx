
import { useEffect, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import PatientsPage from './pages/PatientsPage'

import {
  Activity,
  LayoutDashboard,
  Users,
  CalendarDays,
  ListOrdered,
  Stethoscope,
  FlaskConical,
  Receipt,
  Package,
  BarChart3,
  Settings,
  Bell,
  Search,
  Sun,
  Moon,
  Menu,
  ArrowRight,
  ShieldCheck,
  Building2,
  ClipboardList,
} from 'lucide-react'

import './App.css'

// Each item represents a section in the dental management system.
const navigation = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Patients', icon: Users },
  { name: 'Appointments', icon: CalendarDays },
  { name: 'Live Queue', icon: ListOrdered },
  { name: 'Consultations', icon: Stethoscope },
  { name: 'Laboratory', icon: FlaskConical },
  { name: 'Billing', icon: Receipt },
  { name: 'Inventory', icon: Package },
  { name: 'Analytics', icon: BarChart3 },
  { name: 'Settings', icon: Settings },
]

type Section = (typeof navigation)[number]['name']

export default function App() {
  // Gets the authenticated staff profile and logout function.
  const { user, logout } = useAuth()

  // Tracks the currently selected application section.
  const [section, setSection] = useState<Section>('Dashboard')

  // Controls the mobile sidebar.
  const [menuOpen, setMenuOpen] = useState(false)

  // Restores the user's preferred theme.
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('curvtab-theme') === 'dark'
  )

  // A platform SuperAdmin does not belong to a dental practice
  // and cannot read clinical patient records.
  // Backend authorization remains the actual security enforcement.
  const canViewPatients =
    user?.role !== 'SuperAdmin' && Boolean(user?.dentalPracticeId)

  // Hide the Patients navigation item when the user has no
  // practice-level patient access.
  const visibleNavigation = navigation.filter(
    (item) => item.name !== 'Patients' || canViewPatients
  )

  // Apply dark or light mode across the application.
  useEffect(() => {
    document.documentElement.dataset.theme =
      darkMode ? 'dark' : 'light'

    localStorage.setItem(
      'curvtab-theme',
      darkMode ? 'dark' : 'light'
    )
  }, [darkMode])

  // Navigate to another workspace section.
  function navigate(target: Section) {
    setSection(target)
    setMenuOpen(false)
  }

  return (
    <div className="app-shell">

      {/* Mobile sidebar overlay */}
      {menuOpen && (
        <button
          className="mobile-overlay"
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}

      {/* =========================================
          SIDEBAR
          ========================================= */}
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>

        {/* Application branding */}
        <div className="brand">
          <div className="brand-icon">
            <Activity size={25} />
          </div>

          <div>
            <strong>CurvTab Dental</strong>
            <span>Practice Management</span>
          </div>
        </div>

        {/* Logged-in user's practice information */}
        <div className="practice-chip">
          <Building2 size={18} />

          <div>
            <strong>
              {user?.practiceName ?? 'Platform administration'}
            </strong>

            <span>
              {user?.role ?? 'Staff member'}
            </span>
          </div>
        </div>

        <p className="nav-heading">WORKSPACE</p>

        {/* Sidebar navigation */}
        <nav className="side-nav" aria-label="Main navigation">
          {visibleNavigation.map((item) => {
            const Icon = item.icon

            return (
              <button
                key={item.name}
                type="button"
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
        </nav>

        {/* Sidebar footer */}
        <div className="sidebar-bottom">
          <div className="security-note">
            <ShieldCheck size={20} />

            <div>
              <strong>Secure foundation</strong>
              <span>API authentication verified</span>
            </div>
          </div>

          <p>CurvTab Dental 2.0</p>
        </div>
      </aside>

      {/* =========================================
          MAIN APPLICATION WORKSPACE
          ========================================= */}
      <div className="workspace">

        {/* Top navigation bar */}
        <header className="topbar">
          <div className="topbar-left">

            {/* Mobile navigation button */}
            <button
              className="icon-button mobile-menu"
              type="button"
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

            {/* Search placeholder */}
            <div className="search-label">
              <Search size={17} />
              <span>Search coming soon</span>
            </div>

            {/* Theme toggle */}
            <button
              className="icon-button"
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle dark mode"
            >
              {darkMode
                ? <Sun size={20} />
                : <Moon size={20} />
              }
            </button>

            {/* Notifications placeholder */}
            <span
              className="notification-icon"
              aria-label="Notifications not yet connected"
            >
              <Bell size={20} />
            </span>

            {/* Logged-in user initials */}
            <div className="avatar">
              {user?.fullName
                ?.split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((name) => name.charAt(0).toUpperCase())
                .join('') || 'CT'}
            </div>

            {/* Logout through AuthProvider and ASP.NET Core */}
            <button
              type="button"
              className="secondary-button"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* =========================================
            PAGE CONTENT
            Only ONE section is rendered at a time.
            ========================================= */}
        <main className="main-content">

          {/* =====================================
              DASHBOARD PAGE
              ===================================== */}
          {section === 'Dashboard' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    PRACTICE OVERVIEW
                  </div>

                  <h1>
                    Welcome to CurvTab Dental
                  </h1>

                  <p>
                    Your connected dental practice workspace.
                    Patient and financial data will appear here
                    as their dashboard integrations are completed.
                  </p>
                </div>

                {/* Only practice-bound users can open Patients */}
                {canViewPatients && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => navigate('Patients')}
                  >
                    Open Patients
                    <ArrowRight size={18} />
                  </button>
                )}
              </div>

              {/* Dashboard statistics.
                  Do not invent patient or financial totals.
                  These cards will later use real API data. */}
              <div className="stats-grid">
                {[
                  { label: 'Patients Today', icon: Users },
                  { label: 'Waiting Queue', icon: ListOrdered },
                  { label: 'Consultations', icon: Stethoscope },
                  { label: 'Revenue Today', icon: Receipt },
                ].map((stat) => {
                  const Icon = stat.icon

                  return (
                    <article
                      className="stat-card"
                      key={stat.label}
                    >
                      <div className="stat-top">
                        <span>{stat.label}</span>

                        <div className="stat-icon">
                          <Icon size={19} />
                        </div>
                      </div>

                      <strong className="stat-value">
                        —
                      </strong>

                      <small>
                        Awaiting live API data
                      </small>
                    </article>
                  )
                })}
              </div>

              {/* Dashboard information panels */}
              <div className="dashboard-grid">

                {/* Patient journey panel */}
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Patient Journey</h2>
                      <p>Real-time clinic workflow</p>
                    </div>

                    <ClipboardList size={21} />
                  </div>

                  <div className="journey">
                    {[
                      'Reception',
                      'Waiting Queue',
                      'Consultation',
                      'Laboratory (optional)',
                      'Checkout',
                    ].map((step, index) => (
                      <div
                        className="journey-item"
                        key={step}
                      >
                        <div className="step-number">
                          {index + 1}
                        </div>

                        <div>
                          <strong>{step}</strong>

                          <span>
                            {index === 0
                              ? 'Patient check-in and registration'
                              : index === 1
                              ? 'Queue and patient calling'
                              : index === 2
                              ? 'Clinical treatment workflow'
                              : index === 3
                              ? 'Independent lab order tracking'
                              : 'Billing and visit completion'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Phase 1 foundation panel */}
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>System Foundation</h2>
                      <p>Phase 1 implementation</p>
                    </div>

                    <ShieldCheck size={21} />
                  </div>

                  <div className="foundation-banner">
                    <Activity size={24} />

                    <div>
                      <strong>39 / 39</strong>
                      <span>
                        Backend smoke tests passed
                      </span>
                    </div>
                  </div>

                  <div className="check-list">
                    <div>
                      ✓ Authentication and session security
                    </div>

                    <div>
                      ✓ Staff roles and permissions
                    </div>

                    <div>
                      ✓ Multi-practice data isolation
                    </div>

                    <div>
                      ✓ Patient registration API
                    </div>

                    <div>
                      ✓ Audit logging
                    </div>
                  </div>

                  <p className="panel-note">
                    Phase 1 backend security tests have passed.
                    Frontend modules and browser acceptance
                    testing are still being completed.
                  </p>
                </section>

              </div>
            </>
          )}

          {/* =====================================
              PATIENTS PAGE
              Render ONLY when Patients is selected.
              ===================================== */}
          {section === 'Patients' && canViewPatients && (
            <PatientsPage />
          )}

          {/* =====================================
              OTHER MODULES
              These are Phase 2/3 placeholders.
              ===================================== */}
          {section !== 'Dashboard' &&
            section !== 'Patients' && (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      CURVTAB DENTAL
                    </div>

                    <h1>{section}</h1>

                    <p>
                      This workspace is ready for its
                      corresponding frontend module and
                      backend integration.
                    </p>
                  </div>
                </div>

                <section className="panel empty-panel">
                  <div className="empty-icon">
                    <ClipboardList size={30} />
                  </div>

                  <h2>
                    {section} workspace
                  </h2>

                  <p>
                    No live data is connected yet.
                    We will implement this page using
                    the existing ASP.NET Core API.
                  </p>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => navigate('Dashboard')}
                  >
                    Return to dashboard
                  </button>
                </section>
              </>
            )}

        </main>
      </div>
    </div>
  )
}
