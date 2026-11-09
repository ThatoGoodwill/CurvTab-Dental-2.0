
import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import {
  Settings2, Tags, Building2, Palette, Receipt,
  Stethoscope, CalendarDays, FlaskConical,
  MessageSquare, ShieldCheck, ArrowLeft, X
} from 'lucide-react'
import AppearanceSettingsPage from './AppearanceSettingsPage'
import PracticeSettingsPage from './PracticeSettingsPage'
import ProcedurePricingPage from './ProcedurePricingPage'
import WhatsAppPanel from './WhatsAppPanel'
import LaboratoryAccountsPanel from './LaboratoryAccountsPanel'
import {
  BillingSettings,
  ClinicalSettings,
  SchedulingSettings,
  StaffPermissionsSettings
} from './PracticeConfigurationPanels'
import './ConfigurationCenterPage.css'

type AppearanceProps = ComponentProps<typeof AppearanceSettingsPage>

type Props = AppearanceProps & {
  onClose: () => void
  onOpenStaff: () => void
}

const sections = [
  {
    id: 'appearance',
    title: 'Appearance & Workplace',
    description: 'Themes, branding and workspace layout',
    icon: Palette
  },
  {
    id: 'pricing',
    title: 'Procedure Pricing',
    description: 'Procedure codes and approved fees',
    icon: Tags
  },
  {
    id: 'practice',
    title: 'Practice Profile',
    description: 'Practice and branch information',
    icon: Building2
  },
  {
    id: 'billing',
    title: 'Billing Settings',
    description: 'Invoices and payment configuration',
    icon: Receipt
  },
  {
    id: 'clinical',
    title: 'Clinical Settings',
    description: 'Treatment and procedure defaults',
    icon: Stethoscope
  },
  {
    id: 'scheduling',
    title: 'Scheduling',
    description: 'Clinic hours and appointment rules',
    icon: CalendarDays
  },
  {
    id: 'laboratory',
    title: 'Laboratory Settings',
    description: 'Laboratory partners and workflows',
    icon: FlaskConical
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'WhatsApp and patient reminders',
    icon: MessageSquare
  },
  {
    id: 'security',
    title: 'Staff & Permissions',
    description: 'Roles and access configuration',
    icon: ShieldCheck
  }
] as const

type SectionId = typeof sections[number]['id']

// CT_CONFIGURATION_FLOATING_V2
export default function ConfigurationCenterPage({
  onClose,
  onOpenStaff,
  ...appearanceProps
}: Props) {
  const [section, setSection] = useState<SectionId | null>(null)

  const current = sections.find(item => item.id === section)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()

      if (section !== null) {
        setSection(null)
      } else {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [section, onClose])

  return (
    <div
      className="ct-config-overlay"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="ct-config-dialog"
        role="dialog"
        aria-modal={section === null}
        aria-label="Configuration Center"
      >
        <header className="ct-config-header">
          <div className="ct-config-header-title">
            <Settings2 size={19} aria-hidden="true" />
            <div>
              <h2>Configuration Center</h2>
              <p>Practice-wide system configuration</p>
            </div>
          </div>

          <button
            type="button"
            className="ct-config-icon-button"
            aria-label="Close Configuration Center"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="ct-config-dialog-body">
          <p className="ct-config-intro">
            Select the settings you want to manage.
          </p>

          <div className="ct-config-grid">
            {sections.map(item => {
              const Icon = item.icon

              return (
                <button
                  key={item.id}
                  type="button"
                  className="ct-config-option"
                  onClick={() => setSection(item.id)}
                >
                  <span className="ct-config-option-icon">
                    <Icon size={17} aria-hidden="true" />
                  </span>

                  <span className="ct-config-option-label">
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>

                  <span
                    className="ct-config-chevron"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {section !== null && (
        <div
          className="ct-config-detail-overlay"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setSection(null)
            }
          }}
        >
          <section
            className={
              'ct-config-detail-dialog' +
              (section === 'appearance' || section === 'practice' || section === 'pricing' ||
                section === 'billing' || section === 'clinical' || section === 'scheduling' ||
                section === 'laboratory' || section === 'security'
                ? ' ct-config-detail-appearance'
                : '')
            }
            role="dialog"
            aria-modal="true"
            aria-label={current?.title ?? 'Configuration section'}
          >
            <header className="ct-config-detail-header">
              <button
                type="button"
                className="ct-config-back"
                onClick={() => setSection(null)}
              >
                <ArrowLeft size={15} />
                Back
              </button>

              <strong>{current?.title}</strong>

              <button
                type="button"
                className="ct-config-icon-button"
                aria-label="Close configuration section"
                onClick={() => setSection(null)}
              >
                <X size={17} />
              </button>
            </header>

            <div className="ct-config-detail-body">
              {/* CT_CONFIG_PRACTICE_PROFILE_V3 */}
              {section === 'appearance' ? (
                <AppearanceSettingsPage {...appearanceProps} />
              ) : section === 'practice' ? (
                <div className="ct-config-existing-practice">
                  <PracticeSettingsPage
                    compact
                    onOpenStaff={onOpenStaff}
                  />
                </div>
              ) : section === 'pricing' ? (
                <ProcedurePricingPage />
              ) : section === 'billing' ? (
                <BillingSettings />
              ) : section === 'clinical' ? (
                <ClinicalSettings />
              ) : section === 'scheduling' ? (
                <SchedulingSettings />
              ) : section === 'laboratory' ? (
                <LaboratoryAccountsPanel />
              ) : section === 'security' ? (
                <StaffPermissionsSettings onOpenStaff={onOpenStaff} />
              ) : section === 'notifications' ? (
                <div className="ct-config-existing-notifications">
                  <WhatsAppPanel />
                </div>
              ) : (
                <div className="ct-config-pending">
                  <h3>{current?.title}</h3>
                  <p>{current?.description}</p>

                  <p>
                    This setting is awaiting integration with
                    the appropriate backend configuration.
                  </p>

                  <p>
                    No settings or financial records have been
                    changed from this screen.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
