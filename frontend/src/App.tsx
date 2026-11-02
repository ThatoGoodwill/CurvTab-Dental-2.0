// Access the authenticated user and logout action.
import { useAuth } from './auth/AuthContext'
import { useEffect, useState } from 'react'
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

// Each menu item identifies a section of our application.
// Later, the authenticated user's role will determine which items appear.
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

  // Reads the user who successfully authenticated through ASP.NET Core.
  const { user, logout } = useAuth()
  // Tracks the currently displayed section.
  const [section, setSection] = useState<Section>('Dashboard')

  // Tracks whether the mobile sidebar is visible.
  const [menuOpen, setMenuOpen] = useState(false)

  // Loads the user's preferred theme from browser storage.
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('curvtab-theme') === 'dark'
  )

  // Applies the selected theme to our entire application.
  useEffect(() => {
    document.documentElement.dataset.theme =
      darkMode ? 'dark' : 'light'

    localStorage.setItem(
      'curvtab-theme',
      darkMode ? 'dark' : 'light'
    )
  }, [darkMode])

  // Changes the visible section and closes the mobile menu.
  function navigate(target: Section) {
    setSection(target)
    setMenuOpen(false)
  }

  return (
    <div className="app-shell">
      {/* Mobile navigation overlay */}
      {menuOpen && (
        <button
          className="mobile-overlay"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation"
        />
      )}

      {/* Permanent desktop sidebar */}
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
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
    <strong>{user?.practiceName ?? 'Platform administration'}</strong>
    <span>{user?.role ?? 'Staff member'}</span>
  </div>
</div>

        <p className="nav-heading">WORKSPACE</p>

        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const Icon = item.icon

            return (
              <button
                key={item.name}
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

      <div className="workspace">
        {/* Header remains visible while switching sections */}
        <header className="topbar">
          <div className="topbar-left">
            <button
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
            <div className="search-label">
              <Search size={17} />
              <span>Search coming soon</span>
            </div>

            <button
              className="icon-button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <span className="notification-icon" aria-label="Notifications not yet connected">
              <Bell size={20} />
            </span>

            <div className="avatar">CT</div>\
               <button
                 className="secondary-button"
                 onClick={() => void logout()}
                >
                      Sign out
              </button>
          </div>
        </header>

        <main className="main-content">
          {section === 'Dashboard' ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">PRACTICE OVERVIEW</div>
                  <h1>Welcome to CurvTab Dental</h1>
                  <p>
                    Your connected dental practice workspace.
                    Patient and financial data will appear here
                    after API integration.
                  </p>
                </div>

                <button
                  className="primary-button"
                  onClick={() => navigate('Patients')}
                >
                  Open Patients
                  <ArrowRight size={18} />
                </button>
              </div>

              {/* These are intentionally empty, not fabricated totals. */}
              <div className="stats-grid">
                {[
                  { label: 'Patients Today', icon: Users },
                  { label: 'Waiting Queue', icon: ListOrdered },
                  { label: 'Consultations', icon: Stethoscope },
                  { label: 'Revenue Today', icon: Receipt },
                ].map((stat) => {
                  const Icon = stat.icon

                  return (
                    <article className="stat-card" key={stat.label}>
                      <div className="stat-top">
                        <span>{stat.label}</span>
                        <div className="stat-icon">
                          <Icon size={19} />
                        </div>
                      </div>

                      <strong className="stat-value">—</strong>
                      <small>Awaiting live API data</small>
                    </article>
                  )
                })}
              </div>

              <div className="dashboard-grid">
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
                      <div className="journey-item" key={step}>
                        <div className="step-number">{index + 1}</div>
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
                      <span>Backend smoke tests passed</span>
                    </div>
                  </div>

                  <div className="check-list">
                    <div>✓ Authentication and session security</div>
                    <div>✓ Staff roles and permissions</div>
                    <div>✓ Multi-practice data isolation</div>
                    <div>✓ Patient registration API</div>
                    <div>✓ Audit logging</div>
                  </div>

                  <p className="panel-note">
                    The frontend is currently a preview.
                    Its authentication and data views still need
                    to be connected and tested.
                  </p>
                </section>
              </div>
            </>
          ) : (
            <div className="page-heading">
              <div>
                <div className="eyebrow">CURVTAB DENTAL</div>
                <h1>{section}</h1>
                <p>
                  This workspace is ready for its corresponding
                  frontend module and backend integration.
                </p>
              </div>
            </div>
          )}

          {section !== 'Dashboard' && (
            <section className="panel empty-panel">
              <div className="empty-icon">
                <ClipboardList size={30} />
              </div>

              <h2>{section} workspace</h2>
              <p>
                No live data is connected yet. We'll implement
                this page using the existing ASP.NET Core API.
              </p>

              <button
                className="secondary-button"
                onClick={() => navigate('Dashboard')}
              >
                Return to dashboard
              </button>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}