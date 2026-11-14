import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { apiRequest } from '../services/api'
import './RecoveredClinicalWorkspace.css'

type Procedure = { id: string; toothCode: string | null; description: string; status: string; estimatedCost: number | null; requiresLab?: boolean; createdAtUtc: string }
type Plan = { id: string; title: string; clinicalRationale: string | null; status: string; revision: number; consentName: string | null; consentRecordedAtUtc: string | null; createdAtUtc: string; procedures: Procedure[] }
type Encounter = { id: string; appointmentId: string; chiefComplaint?: string | null; examinationFindings?: string | null; diagnosis?: string | null; treatmentPerformed?: string | null; treatmentPlan?: string | null; followUpAdvice?: string | null; createdAtUtc: string; finalizedAtUtc: string | null; isFinalized: boolean }
type History = { allergies: string | null; currentMedications: string | null; medicalConditions: string | null; dentalHistory: string | null; additionalNotes: string | null }

type CataloguePrice = { id: string; name: string; price: number; isActive: boolean; requiresLab?: boolean }

const planTitles = [
  'Routine dental treatment', 'Restorative treatment', 'Extraction / oral surgery',
  'Endodontic treatment', 'Periodontal treatment', 'Preventive care',
  'Orthodontic referral / assessment', 'Other clinical treatment',
]
const fdiCodes = [
  ...[1, 2, 3, 4].flatMap(quadrant => Array.from({ length: 8 }, (_, index) => `${quadrant}${index + 1}`)),
  ...[5, 6, 7, 8].flatMap(quadrant => Array.from({ length: 5 }, (_, index) => `${quadrant}${index + 1}`)),
]

type Panel = 'Treatment Plan' | 'Clinical Notes & Encounters' | 'Medical Records'

const date = (v?: string | null) => v ? new Date(v).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const details = (v?: string | null) => v?.trim() || 'Not recorded'

export default function RecoveredClinicalWorkspace({ patientId, panel, onOpenLaboratory }: { patientId: string; panel: Panel; onOpenLaboratory?: (patientId: string) => void }) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [openPlanId, setOpenPlanId] = useState<string | null>(null)
  const [encounters, setEncounters] = useState<Encounter[]>([])
  const [history, setHistory] = useState<History | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState<'new' | 'procedure' | 'revise' | 'acknowledge' | null>(null)
  const [activePlan, setActivePlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [title, setTitle] = useState('')
  const [rationale, setRationale] = useState('')
  const [description, setDescription] = useState('')
  const [tooth, setTooth] = useState('')
  const [cost, setCost] = useState('')
  const [priceId, setPriceId] = useState('')
  const [consentName, setConsentName] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [prices, setPrices] = useState<CataloguePrice[]>([])
  const path = `/dentist/patients/${encodeURIComponent(patientId)}/treatment-plans`

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    const request = panel === 'Treatment Plan'
      ? apiRequest<Plan[]>(path).then(v => { if (active) { setPlans(v); setOpenPlanId(current => v.some(plan => plan.id === current) ? current : (v[0]?.id ?? null)) } })
      : panel === 'Clinical Notes & Encounters'
        ? apiRequest<Encounter[]>(`/dentist/patients/${encodeURIComponent(patientId)}/consultations`).then(v => { if (active) setEncounters(v) })
        : apiRequest<History>(`/dentist/patients/${encodeURIComponent(patientId)}/medical-history`).then(v => { if (active) setHistory(v) })
    request.catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load clinical records.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [patientId, panel, reload])

  useEffect(() => {
    apiRequest<CataloguePrice[]>('/practice/procedure-prices')
      .then(rows => setPrices(rows.filter(row => row.isActive)))
      .catch(() => setPrices([]))
  }, [])

  async function completeProcedure(planId: string, procedureId: string) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await apiRequest(`${path}/${planId}/procedures/${procedureId}/complete`, 'POST')
      setNotice('Procedure completed and saved. The treatment remains available in this plan; link it to the active consultation for billing.')
      setReload(n => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update procedure.')
    } finally { setBusy(false) }
  }

  function openModal(type: 'new' | 'procedure' | 'revise' | 'acknowledge', plan?: Plan) {
    setError('')
    setNotice('')
    setActivePlan(plan || null)
    setTitle(type === 'revise' ? plan?.title || '' : '')
    setRationale(type === 'revise' ? plan?.clinicalRationale || '' : '')
    setDescription('')
    setTooth('')
    setCost('')
    setPriceId('')
    setConsentName('')
    setAcknowledged(false)
    setModal(type)
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!modal || busy) return
    if (modal === 'procedure' && (!priceId || !tooth)) {
      setError('Choose an approved priced procedure and its FDI tooth before saving.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (modal === 'new') await apiRequest(path, 'POST', { title, clinicalRationale: rationale })
      if (modal === 'revise' && activePlan) await apiRequest(`${path}/${activePlan.id}`, 'PUT', { title, clinicalRationale: rationale })
      if (modal === 'procedure' && activePlan) await apiRequest(`${path}/${activePlan.id}/procedures`, 'POST', { description, toothCode: tooth || null, estimatedCost: cost.trim() === '' ? null : Number(cost), procedurePriceId: priceId || null })
      if (modal === 'acknowledge' && activePlan) await apiRequest(`${path}/${activePlan.id}/consent`, 'POST', { patientOrRepresentativeName: consentName, acknowledged })
      setNotice('Saved successfully. The clinical record has been updated.')
      setModal(null)
      setReload(n => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.')
    } finally { setBusy(false) }
  }

  return <section className="ct-recovered-panel">
    <div className="ct-recovered-heading">
      <div><h2>{panel}</h2><p>Patient-specific records · Dentist access only</p></div>
      {panel === 'Treatment Plan' && <button className="ct-recovered-primary" onClick={() => openModal('new')}>+ New Plan</button>}
    </div>
    {notice && <p className="ct-recovered-notice" role="status">{notice}</p>}
    {error && <p className="ct-recovered-error" role="alert">{error}</p>}
    {loading && <p>Loading clinical records...</p>}
    {!loading && panel === 'Treatment Plan' && <div className="ct-recovered-stack">
      {plans.length === 0 && <p className="ct-recovered-empty">No treatment plan recorded for this patient. Create a plan to begin.</p>}
      {plans.map(plan => <details className="ct-recovered-card ct-recovered-plan-disclosure" key={plan.id} open={openPlanId === plan.id}>
        <summary className="ct-recovered-card-head ct-recovered-plan-summary" onClick={event => {
          event.preventDefault()
          setOpenPlanId(current => current === plan.id ? null : plan.id)
        }}>
          <div>
            <h3>{plan.title}</h3>
            <small>Revision {plan.revision} · {date(plan.createdAtUtc)} · {plan.procedures.length} {plan.procedures.length === 1 ? 'procedure' : 'procedures'}</small>
          </div>
          <div className="ct-recovered-plan-summary-end">
            <strong>{plan.status}</strong>
            <span aria-hidden="true" className="ct-recovered-plan-chevron">⌄</span>
          </div>
        </summary>
        <div className="ct-recovered-plan-body">
        <p>{details(plan.clinicalRationale)}</p>
        <h4>Planned procedures</h4>
        {plan.procedures.length ? <div className="ct-recovered-table-wrap"><table><thead><tr><th>Procedure</th><th>Tooth</th><th>Estimated cost</th><th>Status</th></tr></thead><tbody>
          {plan.procedures.map(p => <tr key={p.id}><td>{p.description}{p.requiresLab && <> <strong title="Needs a laboratory order">· LAB REQUIRED</strong></>}</td><td>{p.toothCode || '—'}</td><td>{p.estimatedCost === null ? '—' : `R ${p.estimatedCost.toFixed(2)}`}</td><td>{p.status}{p.requiresLab && p.status !== 'Completed' && onOpenLaboratory && <> <button type="button" onClick={() => onOpenLaboratory(patientId)}>Prescribe / track lab work</button></>}{plan.consentRecordedAtUtc && p.status !== 'Completed' && p.status !== 'Cancelled' && p.status !== 'Declined' && <> <button type="button" disabled={busy} title={p.requiresLab ? 'Available after laboratory manufacture, QA and dentist fitment are recorded.' : 'Confirm this procedure was performed'} onClick={() => void completeProcedure(plan.id, p.id)}>{p.requiresLab ? 'Confirm lab treatment complete' : 'Mark completed'}</button></>}</td></tr>)}
        </tbody></table></div> : <p>No procedures added.</p>}
        {plan.consentRecordedAtUtc && <p className="ct-recovered-notice">Acknowledgement recorded for {plan.consentName} on {date(plan.consentRecordedAtUtc)}. This is a recorded acknowledgement, not a digital signature.</p>}
        {!plan.consentRecordedAtUtc && <div className="ct-recovered-actions">
          <button onClick={() => openModal('procedure', plan)}>+ Add Procedure</button>
          <button onClick={() => openModal('revise', plan)}>Revise Plan</button>
          <button onClick={() => openModal('acknowledge', plan)} disabled={plan.procedures.length === 0}>Record Acknowledgement</button>
        </div>}
        </div>
      </details>)}
    </div>}
    {!loading && panel === 'Clinical Notes & Encounters' && <div className="ct-recovered-stack">
      {encounters.length === 0 && <p className="ct-recovered-empty">No previous consultations recorded. Create and edit encounters in the existing Consultations workspace.</p>}
      {encounters.map(item => <article key={item.id} className="ct-recovered-card">
        <div className="ct-recovered-card-head"><h3>{date(item.createdAtUtc)} · Clinical encounter</h3><strong>{item.isFinalized ? 'Finalised' : 'In progress'}</strong></div>
        <dl className="ct-recovered-facts"><div><dt>Chief complaint</dt><dd>{details(item.chiefComplaint)}</dd></div><div><dt>Examination findings</dt><dd>{details(item.examinationFindings)}</dd></div><div><dt>Diagnosis</dt><dd>{details(item.diagnosis)}</dd></div><div><dt>Treatment performed</dt><dd>{details(item.treatmentPerformed)}</dd></div><div><dt>Treatment plan</dt><dd>{details(item.treatmentPlan)}</dd></div><div><dt>Follow-up advice</dt><dd>{details(item.followUpAdvice)}</dd></div></dl>
      </article>)}
    </div>}
    {!loading && panel === 'Medical Records' && <article className="ct-recovered-card">
      <p>Medical history is confidential and can be edited in the existing Dentist Consultations workflow.</p>
      <dl className="ct-recovered-facts">
        <div><dt>Allergies</dt><dd>{details(history?.allergies)}</dd></div><div><dt>Medications</dt><dd>{details(history?.currentMedications)}</dd></div><div><dt>Medical conditions</dt><dd>{details(history?.medicalConditions)}</dd></div><div><dt>Dental history</dt><dd>{details(history?.dentalHistory)}</dd></div><div><dt>Additional notes</dt><dd>{details(history?.additionalNotes)}</dd></div>
      </dl>
    </article>}

    {modal && <div className="ct-recovered-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setModal(null) }}>
      <div className="ct-recovered-modal" role="dialog" aria-modal="true" aria-label={modal === 'new' ? 'New treatment plan' : modal === 'procedure' ? 'Add treatment procedure' : modal === 'revise' ? 'Revise treatment plan' : 'Record patient acknowledgement'}>
        <div className="ct-recovered-card-head"><h3>{modal === 'new' ? 'New Treatment Plan' : modal === 'procedure' ? 'Add Procedure' : modal === 'revise' ? 'Revise Treatment Plan' : 'Record Acknowledgement'}</h3><button type="button" onClick={() => setModal(null)} disabled={busy} aria-label="Close">×</button></div>
        <form onSubmit={e => void submit(e)}>
          {(modal === 'new' || modal === 'revise') && <>
            <label>Plan title
              <select required value={title} onChange={e => setTitle(e.target.value)}>
                <option value="">Select treatment plan type…</option>
                {planTitles.map(item => <option key={item} value={item}>{item}</option>)}
                {title && !planTitles.includes(title) && <option value={title}>{title}</option>}
              </select>
            </label>
            <label>Clinical rationale<textarea maxLength={4000} rows={4} value={rationale} onChange={e => setRationale(e.target.value)} /></label>
          </>}
          {modal === 'procedure' && <>
            <label>Procedure from approved practice price list
              <select required value={priceId} onChange={e => {
                const selected = prices.find(x => x.id === e.target.value)
                setPriceId(selected?.id ?? '')
                setDescription(selected?.name ?? '')
                setCost(selected ? selected.price.toFixed(2) : '')
              }}>
                <option value="">Choose procedure…</option>
                {prices.map(x => <option key={x.id} value={x.id}>{x.name} — R{x.price.toFixed(2)}{x.requiresLab ? ' (lab)' : ''}</option>)}
              </select>
            </label>
            {!prices.length && <p role="alert">No approved procedure prices are configured. Ask Practice Admin to publish prices in Configuration Center.</p>}
            <label>Procedure description<input readOnly required value={description} /></label>
            <label>FDI tooth code (required)
              <select required value={tooth} onChange={e => setTooth(e.target.value)}>
                <option value="">Select tooth…</option>
                <optgroup label="Permanent teeth">{fdiCodes.slice(0, 32).map(code => <option key={code} value={code}>{code}</option>)}</optgroup>
                <optgroup label="Primary teeth">{fdiCodes.slice(32).map(code => <option key={code} value={code}>{code}</option>)}</optgroup>
              </select>
            </label>
            <label>Estimated cost (approved ZAR)<input readOnly type="text" value={cost ? 'R ' + cost : ''} placeholder="Select a procedure first" /></label>
          </>}
          {modal === 'acknowledge' && <><p>This records that the treatment plan was discussed and acknowledged. It does not replace a signed consent form or the dentist's clinical consent process.</p><label>Patient or representative name<input required maxLength={200} value={consentName} onChange={e => setConsentName(e.target.value)} /></label><label className="ct-recovered-check"><input type="checkbox" required checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} /> I confirm acknowledgement was obtained from the named person.</label></>}
          <div className="ct-recovered-actions"><button type="button" onClick={() => setModal(null)} disabled={busy}>Cancel</button><button type="submit" className="ct-recovered-primary" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button></div>
        </form>
      </div>
    </div>}
  </section>
}
