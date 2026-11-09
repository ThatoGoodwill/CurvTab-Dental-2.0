import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ShieldCheck, Users } from 'lucide-react'
import { apiRequest } from '../services/api'
import './PracticeConfigurationPanels.css'

type DayHours = { day: number; open: boolean; from: string; to: string }

type Config = {
  hours: DayHours[]
  slotMinutes: number
  bufferMinutes: number
  advanceBookingDays: number
  cancellationNoticeHours: number
  invoicePrefix: string
  vatRatePercent: number
  paymentTermsDays: number
  invoiceFooter: string
  defaultAppointmentMinutes: number
  requireToothForProcedure: boolean
  consentRequiredBeforeTreatment: boolean
  defaultRecallMonths: number
}

// Monday first, Sunday last (the API uses 0 = Sunday).
const dayOrder = [1, 2, 3, 4, 5, 6, 0]
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function friendly(error: unknown) {
  const text = error instanceof Error ? error.message : ''
  if (text.includes('403'))
    return 'Only the practice administrator can change these settings.'
  return text || 'Unable to complete the request.'
}

function useConfig() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setConfig(await apiRequest<Config>('/practice/configuration'))
    } catch (cause) {
      setError(friendly(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function change<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig(previous => (previous ? { ...previous, [key]: value } : previous))
    setMessage('')
  }

  async function save() {
    if (!config || saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const saved = await apiRequest<Config>('/practice/configuration', 'PUT', config)
      setConfig(saved)
      setMessage('Settings saved.')
    } catch (cause) {
      setError(friendly(cause))
    } finally {
      setSaving(false)
    }
  }

  return { config, loading, saving, error, message, change, save }
}

type Shell = ReturnType<typeof useConfig>

function Frame({ title, hint, state, children }: {
  title: string
  hint: string
  state: Shell
  children: (config: Config) => ReactNode
}) {
  return (
    <div className="ct-cfgp">
      <header className="ct-cfgp-head">
        <div>
          <h2>{title}</h2>
          <p>{hint}</p>
        </div>
        <button type="button" className="ct-cfgp-save"
          disabled={!state.config || state.saving} onClick={() => void state.save()}>
          {state.saving ? 'Saving…' : 'Save settings'}
        </button>
      </header>
      {state.error && <p className="ct-cfgp-error" role="alert">{state.error}</p>}
      {state.message && <p className="ct-cfgp-ok" role="status">{state.message}</p>}
      {state.loading && <p className="ct-cfgp-muted">Loading…</p>}
      {state.config && children(state.config)}
    </div>
  )
}

function NumberField({ label, value, min, max, step, suffix, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="ct-cfgp-field">
      <span>{label}</span>
      <div className="ct-cfgp-input-row">
        <input type="number" value={value} min={min} max={max} step={step ?? 1}
          onChange={event => onChange(Number(event.target.value))} />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  )
}

export function SchedulingSettings() {
  const state = useConfig()
  return (
    <Frame title="Scheduling" hint="Clinic hours and appointment rules." state={state}>
      {config => (
        <>
          <div className="ct-cfgp-hours">
            {dayOrder.map(day => {
              const row = config.hours.find(item => item.day === day)
              if (!row) return null
              const update = (patch: Partial<DayHours>) =>
                state.change('hours', config.hours.map(item =>
                  item.day === day ? { ...item, ...patch } : item))
              return (
                <div key={day} className="ct-cfgp-hours-row">
                  <label className="ct-cfgp-check">
                    <input type="checkbox" checked={row.open}
                      onChange={event => update({ open: event.target.checked })} />
                    <strong>{dayNames[day]}</strong>
                  </label>
                  {row.open ? (
                    <div className="ct-cfgp-times">
                      <input type="time" value={row.from}
                        onChange={event => update({ from: event.target.value })} />
                      <span>to</span>
                      <input type="time" value={row.to}
                        onChange={event => update({ to: event.target.value })} />
                    </div>
                  ) : <span className="ct-cfgp-muted">Closed</span>}
                </div>
              )
            })}
          </div>
          <div className="ct-cfgp-grid">
            <NumberField label="Appointment slot" value={config.slotMinutes} min={5} max={120} step={5}
              suffix="minutes" onChange={value => state.change('slotMinutes', value)} />
            <NumberField label="Buffer between patients" value={config.bufferMinutes} min={0} max={60} step={5}
              suffix="minutes" onChange={value => state.change('bufferMinutes', value)} />
            <NumberField label="Book up to" value={config.advanceBookingDays} min={1} max={365}
              suffix="days ahead" onChange={value => state.change('advanceBookingDays', value)} />
            <NumberField label="Cancellation notice" value={config.cancellationNoticeHours} min={0} max={168}
              suffix="hours" onChange={value => state.change('cancellationNoticeHours', value)} />
          </div>
        </>
      )}
    </Frame>
  )
}

export function BillingSettings() {
  const state = useConfig()
  return (
    <Frame title="Billing" hint="Invoice and payment configuration." state={state}>
      {config => (
        <>
          <div className="ct-cfgp-grid">
            <label className="ct-cfgp-field">
              <span>Invoice prefix</span>
              <input type="text" value={config.invoicePrefix} maxLength={10}
                onChange={event => state.change('invoicePrefix', event.target.value)} />
            </label>
            <NumberField label="VAT rate" value={config.vatRatePercent} min={0} max={30} step={0.5}
              suffix="%" onChange={value => state.change('vatRatePercent', value)} />
            <NumberField label="Payment terms" value={config.paymentTermsDays} min={0} max={90}
              suffix="days" onChange={value => state.change('paymentTermsDays', value)} />
          </div>
          <label className="ct-cfgp-field">
            <span>Invoice footer (printed on invoices)</span>
            <textarea rows={3} maxLength={300} value={config.invoiceFooter}
              onChange={event => state.change('invoiceFooter', event.target.value)} />
          </label>
          <p className="ct-cfgp-muted">
            Procedure fees are managed under Procedure Pricing.
          </p>
        </>
      )}
    </Frame>
  )
}

export function ClinicalSettings() {
  const state = useConfig()
  return (
    <Frame title="Clinical" hint="Treatment and procedure defaults." state={state}>
      {config => (
        <>
          <div className="ct-cfgp-grid">
            <NumberField label="Default appointment length" value={config.defaultAppointmentMinutes}
              min={5} max={240} step={5} suffix="minutes"
              onChange={value => state.change('defaultAppointmentMinutes', value)} />
            <NumberField label="Recall reminder interval" value={config.defaultRecallMonths}
              min={0} max={24} suffix="months (0 = off)"
              onChange={value => state.change('defaultRecallMonths', value)} />
          </div>
          <label className="ct-cfgp-check ct-cfgp-block">
            <input type="checkbox" checked={config.requireToothForProcedure}
              onChange={event => state.change('requireToothForProcedure', event.target.checked)} />
            <span>Require a tooth number when adding a procedure</span>
          </label>
          <label className="ct-cfgp-check ct-cfgp-block">
            <input type="checkbox" checked={config.consentRequiredBeforeTreatment}
              onChange={event => state.change('consentRequiredBeforeTreatment', event.target.checked)} />
            <span>Consent must be recorded before treatment</span>
          </label>
        </>
      )}
    </Frame>
  )
}

const roleGuide: { role: string; can: string }[] = [
  { role: 'Practice Admin', can: 'Staff accounts, settings, procedure prices and laboratory partners.' },
  { role: 'Dentist', can: 'Clinical work, lab prescriptions, quality review and fitment.' },
  { role: 'Receptionist', can: 'Patients, appointments, checkout and lab dispatch and receiving.' },
  { role: 'Finance', can: 'Billing, payments and claims.' },
  { role: 'Lab Technician', can: 'Only the jobs of the laboratory they are assigned to.' }
]

export function StaffPermissionsSettings({ onOpenStaff }: { onOpenStaff: () => void }) {
  return (
    <div className="ct-cfgp">
      <header className="ct-cfgp-head">
        <div>
          <h2>Staff &amp; Permissions</h2>
          <p>Roles and access configuration.</p>
        </div>
        <button type="button" className="ct-cfgp-save" onClick={onOpenStaff}>
          <Users size={14} aria-hidden="true" /> Manage staff accounts
        </button>
      </header>
      <ul className="ct-cfgp-roles">
        {roleGuide.map(item => (
          <li key={item.role}>
            <ShieldCheck size={15} aria-hidden="true" />
            <div><strong>{item.role}</strong><span>{item.can}</span></div>
          </li>
        ))}
      </ul>
      <p className="ct-cfgp-muted">
        Access is enforced by the server. Create accounts and assign roles in Manage staff accounts.
      </p>
    </div>
  )
}
