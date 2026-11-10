import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  ClipboardList, Truck, PackageCheck, ScanLine,
  Wrench, ShieldCheck, Stethoscope, RotateCcw,
  CheckCircle2, ChevronRight, Plus, RefreshCw, Upload, FileText,
  AlertTriangle, Printer, X, Building2, ArrowLeft, Search, Clock3
} from 'lucide-react'
import { apiRequest } from '../services/api'
import { useAuth } from '../auth/AuthContext'
import './LaboratoryModule.css'

type Partner = { id: string; name: string; contact: string | null; phone: string | null; isActive: boolean }
type LabItem = {
  id: string; toothCode: string; procedure: string; isRemovable: boolean
  manufacturingStatus: string; custodyStatus: string; qaStatus: string
  clinicalStatus: string; activeManifestId: string | null
  expectedAtUtc: string | null; completedAtUtc: string | null
  patientHandedOverAtUtc: string | null; guaranteeNote: string | null; correctionCount: number
}
type LabOrder = {
  id: string; reference: string; patientId: string; patientName: string
  laboratoryPartnerId: string; treatmentPlanId: string | null; instructions: string
  status: string; createdAtUtc: string; closedAtUtc: string | null; items: LabItem[]
}
type Manifest = {
  id: string; reference: string; laboratoryPartnerId: string; direction: 'ToLab' | 'ToPractice'
  status: string; packageCount: number; collectorName: string | null; receiverName: string | null
  waybill: string | null; acknowledgement: string | null; discrepancy: string | null
  preparedAtUtc: string; handedOverAtUtc: string | null; receivedAtUtc: string | null
  lines: { laboratoryItemId: string; receivedAtUtc: string | null }[]
}
type Correction = { id: string; laboratoryItemId: string; kind: string; status: string
  reason: string; instructions: string; priority: string; dueAtUtc: string | null; createdAtUtc: string }
type Activity = { id: string; laboratoryOrderId: string; laboratoryItemId: string | null
  laboratoryManifestId: string | null; action: string; details: string | null; atUtc: string }
type Evidence = { id: string; laboratoryOrderId: string; laboratoryItemId: string
  fileName: string; contentType: string; uploadedAtUtc: string }
type Dashboard = {
  partnerMode: boolean; partners: Partner[]; orders: LabOrder[]; manifests: Manifest[]
  corrections: Correction[]; activities: Activity[]; evidence: Evidence[]
}
type PatientRow = { id: string; firstName: string; lastName: string }
type PatientList = { items: PatientRow[] }
type StaffRow = { id: string; fullName: string; email: string; role: string; isActive: boolean }

type Section = 'orders' | 'case' | 'dispatch' | 'production' | 'receiving' | 'fitment' | 'returns' | 'history'
const time = (s: string | null) => s ? new Date(s).toLocaleString() : 'Not recorded'
const label = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
const empty = { partnerMode: false, partners: [], orders: [], manifests: [], corrections: [], activities: [], evidence: [] } as Dashboard

function Pill({ children, status }: { children: ReactNode; status?: string }) {
  const val = (status ?? String(children)).toLowerCase()
  const tone = /closed|complete|passed|accepted|received|fitted/.test(val) ? 'ok'
    : /failed|rejected|redo|correction|delayed|missing/.test(val) ? 'bad'
      : /transit|partial|prepared|pending|open|urgent/.test(val) ? 'warn' : 'neutral'
  return <span className={`lab-pill lab-pill-${tone}`}>{children}</span>
}
function Field({ label: title, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return <label className="lab-field"><span>{title}{required ? ' *' : ''}</span>{children}</label>
}
function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const stop = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', stop)
    return () => window.removeEventListener('keydown', stop)
  }, [onClose])
  return <div className="lab-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="lab-modal" role="dialog" aria-modal="true" aria-label={title}>
      <header><h3>{title}</h3><button type="button" aria-label="Close form" className="lab-icon-button" onClick={onClose}><X size={20}/></button></header>
      {children}
    </div>
  </div>
}

export default function LaboratoryModule() {
  const { user } = useAuth()
  const role = user?.role ?? ''
  const isLab = role === 'LabTechnician'
  const dentist = role === 'Dentist'
  const admin = role === 'PracticeAdmin'
  const front = role === 'Receptionist' || admin
  const [data, setData] = useState<Dashboard>(empty)
  const [labNeeded, setLabNeeded] = useState<{ procedureId: string; patientName: string; planTitle: string; description: string; toothCode: string | null }[]>([])
  const [section, setSection] = useState<Section>('orders') // CT_LAB_WORKBENCH_V3
  const [orderId, setOrderId] = useState('')
  const [itemId, setItemId] = useState('')
  const [manifestId, setManifestId] = useState('')
  const [marked, setMarked] = useState<string[]>([])
  const [modal, setModal] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [patients, setPatients] = useState<PatientRow[]>([])
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [form, setForm] = useState<Record<string, string>>({})
  const [caseSearch, setCaseSearch] = useState('')
  const [draftItems, setDraftItems] = useState<{ toothCode: string; procedure: string; isRemovable: boolean }[]>([
    { toothCode: '', procedure: '', isRemovable: false },
  ])
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await apiRequest<Dashboard>('/laboratory/dashboard')
      setData(next)
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load laboratory data') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    apiRequest<typeof labNeeded>('/laboratory/lab-required').then(setLabNeeded).catch(() => setLabNeeded([]))
  }, [])
  useEffect(() => {
    if (modal !== 'order' || isLab) return
    const t = setTimeout(() => {
      apiRequest<PatientList>(`/patients?q=${encodeURIComponent(form.patientQuery || '')}&pageSize=100`)
        .then(r => setPatients(r.items)).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [modal, form.patientQuery, isLab])
  useEffect(() => {
    if (isLab) return
    apiRequest<PatientList>('/patients?pageSize=100').then(r => setPatients(r.items)).catch(() => {})
    if (admin) apiRequest<StaffRow[]>('/staff').then(setStaff).catch(() => {})
  }, [isLab, admin])

  const order = data.orders.find(o => o.id === orderId) ?? data.orders[0]
  const allItems = useMemo(() => data.orders.flatMap(o => o.items.map(i => ({ ...i, order: o }))), [data.orders])
  const item = allItems.find(i => i.id === itemId) ?? (order?.items[0] ? allItems.find(i => i.id === order.items[0].id) : undefined)
  const manifest = data.manifests.find(m => m.id === manifestId) ?? data.manifests[0]
  const partnerName = (id: string) => data.partners.find(p => p.id === id)?.name ?? 'Assigned laboratory'
  const manifestItem = (id: string) => allItems.find(i => i.id === id)

  async function act(path: string, body: unknown, success: string, nextScreen?: number) {
    setBusy(true); setError(''); setNotice('')
    try {
      await apiRequest(path, 'POST', body)
      setNotice(success); setModal(''); setMarked([])
      await load()
      if (nextScreen === 1) setSection('dispatch')
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed') }
    finally { setBusy(false) }
  }
  const open = (name: string, selectedItem?: string, selectedManifest?: string) => {
    if (selectedItem) setItemId(selectedItem)
    if (selectedManifest) setManifestId(selectedManifest)
    setForm({}); setUploadFile(null); setError(''); setModal(name)
    if (name === 'order') setDraftItems([{ toothCode: '', procedure: '', isRemovable: false }])
  }
  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))
  const selected = (id: string) => setMarked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  const lines = (m: Manifest) => m.lines.map(l => ({ ...l, item: manifestItem(l.laboratoryItemId) })).filter(x => !!x.item)

  const eligibleToLab = allItems.filter(i => i.custodyStatus === 'AtPractice' && !i.activeManifestId &&
    ['AwaitingDispatch', 'CorrectionReady', 'RedoRequested'].includes(i.manufacturingStatus) && i.order.status !== 'Closed')
  const eligibleToPractice = allItems.filter(i => i.custodyStatus === 'AtLab' && !i.activeManifestId && i.manufacturingStatus === 'Complete')
  const groupSelection = async (direction: 'ToLab' | 'ToPractice') => {
    const matching = (direction === 'ToPractice' ? eligibleToPractice : eligibleToLab).filter(i => marked.includes(i.id))
    if (!matching.length) { setError('Select one or more eligible items.'); return }
    const grouped = [...new Set(matching.map(i => i.order.laboratoryPartnerId))]
    setBusy(true); setError(''); setNotice('')
    try {
      for (const laboratoryPartnerId of grouped) {
        await apiRequest('/laboratory/manifests/prepare', 'POST', {
          laboratoryPartnerId, direction,
          itemIds: matching.filter(i => i.order.laboratoryPartnerId === laboratoryPartnerId).map(i => i.id),
        })
      }
      setMarked([]); setNotice(`${grouped.length} separate laboratory manifest(s) prepared. No physical handover recorded.`)
      await load(); setSection('dispatch')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not prepare manifest') }
    finally { setBusy(false) }
  }
  const activeManifest = manifest

  async function submitEvidence(e: FormEvent) {
    e.preventDefault()
    if (!uploadFile || !item) return
    setBusy(true); setError('')
    try {
      const body = new FormData(); body.append('file', uploadFile)
      const r = await fetch(`/api/laboratory/items/${item.id}/evidence`, {
        method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body,
      })
      if (!r.ok) { const p = await r.json().catch(() => ({})); throw new Error(p.title || 'Upload failed') }
      setNotice('Clinical evidence safely attached to this item.'); setModal(''); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed') }
    finally { setBusy(false) }
  }

  function submitModal(e: FormEvent) {
    e.preventDefault()
    if (modal === 'partner') void act('/laboratory/partners', { name: form.name, contact: form.contact, phone: form.phone }, 'Partner added.')
    if (modal === 'assign') void act(`/laboratory/partners/${form.partnerId}/members`, { userId: form.userId }, 'Technician account assigned to laboratory.')
    if (modal === 'order') void act('/laboratory/orders', {
      patientId: form.patientId, laboratoryPartnerId: form.partnerId,
      treatmentPlanId: form.treatmentPlanId || null, instructions: form.instructions,
      items: draftItems,
    }, 'Clinical laboratory prescription created. Reception can prepare dispatch.', 1)
    if (modal === 'handover' && activeManifest) void act(`/laboratory/manifests/${activeManifest.id}/handover`, {
      collectorName: form.collectorName, waybill: form.waybill || '',
      packageCount: Number(form.packageCount || 1), acknowledgement: form.acknowledgement,
    }, 'Physical handover confirmed; items now in transit.')
    if (modal === 'receive' && activeManifest) void act(`/laboratory/manifests/${activeManifest.id}/receive`, {
      receiverName: form.receiverName,
      receivedItemIds: marked.filter(id => activeManifest.lines.some(l => l.laboratoryItemId === id && !l.receivedAtUtc)),
      discrepancy: form.discrepancy || '',
    }, 'Physical receipt recorded. Clinical QA remains separate.')
    if (modal === 'intake' && item) void act(`/laboratory/items/${item.id}/intake`, {
      decision: form.decision, notes: form.notes,
    }, 'Laboratory intake decision saved against the original item.')
    if (modal === 'impression' && item) void act(`/laboratory/items/${item.id}/impression-correction`, {
      notes: form.notes,
    }, 'New impression recorded. Reception can dispatch it under the original order.', 1)
    if (modal === 'production' && item) void act(`/laboratory/items/${item.id}/production`, {
      stage: form.stage, notes: form.notes, expectedAtUtc: form.expectedAtUtc ? `${form.expectedAtUtc}T12:00:00Z` : null,
    }, 'Item-level fabrication stage and timestamp saved.')
    if (modal === 'qa' && item) void act(`/laboratory/items/${item.id}/qa`, {
      passed: form.qaResult === 'Passed', notes: form.notes,
    }, 'Practice QA recorded. This does not mark clinical fitment complete.')
    if (modal === 'fit' && item) void act(`/laboratory/items/${item.id}/fit`, {
      outcome: form.outcome, notes: form.notes, guaranteeNote: form.guaranteeNote || null,
    }, 'Actual clinical fitment recorded and tooth history updated.')
    if (modal === 'redo' && item) void act(`/laboratory/items/${item.id}/redo`, {
      reason: form.reason, instructions: form.instructions,
      priority: form.priority || 'Standard', dueAtUtc: form.dueAtUtc ? `${form.dueAtUtc}T12:00:00Z` : null,
    }, 'Linked redo requested for this item only; no new patient charge.', 1)
    if (modal === 'patient' && item) void act(`/laboratory/items/${item.id}/patient-handover`, {
      receivedByName: form.receivedByName, notes: form.notes || '',
    }, 'Actual removable-appliance handover recorded.')
    if (modal === 'close' && order) void act(`/laboratory/orders/${order.id}/close`, {}, 'All items verified; clinical episode closed.')
  }

  const selectedOrderItems = order?.items ?? []
  const availablePartners = data.partners.filter(p => p.isActive)
  const clinicalQa = allItems.filter(i => i.custodyStatus === 'AtPractice' && i.manufacturingStatus === 'Complete' && i.qaStatus === 'Pending')
  const fitmentQueue = allItems.filter(i => i.qaStatus === 'Passed' && i.custodyStatus === 'AtPractice' && i.manufacturingStatus === 'Complete' && i.clinicalStatus !== 'Completed')
  const labIntake = allItems.filter(i => i.custodyStatus === 'AtLab' && i.manufacturingStatus === 'AwaitingInspection')
  const fabrication = allItems.filter(i => i.custodyStatus === 'AtLab' && ['Accepted','InProduction','Delayed'].includes(i.manufacturingStatus))
  const redoQueue = allItems.filter(i => i.custodyStatus === 'AtPractice' && i.clinicalStatus !== 'Completed' && (i.qaStatus === 'Failed' || i.clinicalStatus === 'NotFitted'))
  const manifestDirection = isLab ? 'ToPractice' : 'ToLab'
  const transferItems = isLab ? eligibleToPractice : eligibleToLab
  const transferManifests = data.manifests.filter(m => m.direction === manifestDirection)
  const receiptManifests = data.manifests.filter(m => m.direction === (isLab ? 'ToLab' : 'ToPractice'))
  const completedCount = (o: LabOrder) => o.items.filter(i => i.clinicalStatus === 'Completed').length
  const readyToClose = (o: LabOrder) => o.items.length > 0 && o.items.every(i =>
    i.clinicalStatus === 'Completed' && i.qaStatus === 'Passed' && i.custodyStatus === 'AtPractice' &&
    !i.activeManifestId && (!i.isRemovable || Boolean(i.patientHandedOverAtUtc)))
  const openCase = (id: string, selectedItemId = '') => {
    setOrderId(id); setItemId(selectedItemId); setSection('case'); setError(''); setMarked([])
  }
  const nav: { id: Section; name: string; Icon: typeof ClipboardList; count?: number }[] = isLab ? [
    {id:'orders',name:'My orders',Icon:ClipboardList},
    {id:'receiving',name:'Incoming',Icon:ScanLine,count:labIntake.length},
    {id:'production',name:'Production',Icon:Wrench,count:fabrication.length},
    {id:'dispatch',name:'Send to practice',Icon:Truck,count:eligibleToPractice.length},
    {id:'history',name:'History',Icon:Clock3},
  ] : dentist ? [
    {id:'orders',name:'Lab orders',Icon:ClipboardList},
    {id:'receiving',name:'Quality review',Icon:PackageCheck,count:clinicalQa.length},
    {id:'fitment',name:'Fitment & closure',Icon:Stethoscope,count:fitmentQueue.length},
    {id:'returns',name:'Corrections & redo',Icon:RotateCcw,count:redoQueue.length},
    {id:'history',name:'History',Icon:Clock3},
  ] : [
    {id:'orders',name:'Lab orders',Icon:ClipboardList},
    {id:'dispatch',name:'Dispatch',Icon:Truck,count:eligibleToLab.length},
    {id:'receiving',name:'Receive from lab',Icon:PackageCheck,count:receiptManifests.filter(m => ['Dispatched','PartiallyReceived'].includes(m.status)).length},
    {id:'returns',name:'Returns',Icon:RotateCcw,count:redoQueue.length},
    {id:'history',name:'History',Icon:Clock3},
  ]

  function ItemControls({ current }: { current: LabItem }) {
    const isAtPractice = current.custodyStatus === 'AtPractice'
    const isAtLab = current.custodyStatus === 'AtLab'
    const failed = current.qaStatus === 'Failed' || current.clinicalStatus === 'NotFitted'
    return <div className="lab-item-actions">
      {isLab && isAtLab && current.manufacturingStatus === 'AwaitingInspection' && <button type="button" className="lab-primary" onClick={() => open('intake',current.id)}>Inspect impression</button>}
      {isLab && isAtLab && ['Accepted','InProduction','Delayed'].includes(current.manufacturingStatus) && <button type="button" className="lab-primary" onClick={() => open('production',current.id)}>Update production</button>}
      {isLab && isAtLab && current.manufacturingStatus === 'Complete' && !current.activeManifestId && <button type="button" className="lab-secondary" onClick={() => {setSection('dispatch');setMarked([current.id])}}>Prepare delivery</button>}
      {dentist && isAtPractice && current.manufacturingStatus === 'CorrectionRequired' && <button type="button" className="lab-primary" onClick={() => open('impression',current.id)}>Record new impression</button>}
      {dentist && isAtPractice && current.manufacturingStatus === 'Complete' && current.qaStatus === 'Pending' && <button type="button" className="lab-primary" onClick={() => open('qa',current.id)}>Record clinical QA</button>}
      {dentist && isAtPractice && current.qaStatus === 'Passed' && current.clinicalStatus !== 'Completed' && current.manufacturingStatus === 'Complete' && <button type="button" className="lab-primary" onClick={() => open('fit',current.id)}>Record fitment</button>}
      {dentist && isAtPractice && failed && current.clinicalStatus !== 'Completed' && current.manufacturingStatus !== 'RedoRequested' && <button type="button" className="lab-primary" onClick={() => open('redo',current.id)}>Request adjustment / redo</button>}
      {front && isAtPractice && ['AwaitingDispatch','CorrectionReady','RedoRequested'].includes(current.manufacturingStatus) && !current.activeManifestId && <button type="button" className="lab-secondary" onClick={() => {setSection('dispatch');setMarked([current.id])}}>Prepare dispatch</button>}
      {(dentist || admin) && current.isRemovable && current.clinicalStatus === 'Completed' && !current.patientHandedOverAtUtc && <button type="button" className="lab-primary" onClick={() => open('patient',current.id)}>Confirm patient handover</button>}
      {(dentist || isLab) && <button type="button" className="lab-secondary" onClick={() => open('upload',current.id)}><Upload size={14}/> Attach evidence</button>}
    </div>
  }

  function EventHistory({ orderFilter }: { orderFilter?: string }) {
    const events = data.activities.filter(e => !orderFilter || e.laboratoryOrderId === orderFilter)
    return <div className="lab-history-list">{events.slice(0,100).map(e => <div className="lab-event" key={e.id}>
      <div className="lab-event-marker"/><div className="lab-event-content"><div className="lab-event-top"><strong>{label(e.action)}</strong><time>{time(e.atUtc)}</time></div>
      {e.details && <p>{e.details}</p>}
      {!orderFilter && <button className="lab-text-link" type="button" onClick={() => openCase(e.laboratoryOrderId)}>{data.orders.find(o=>o.id===e.laboratoryOrderId)?.reference || 'Open order'}</button>}
      </div></div>)}{!events.length && <p className="lab-empty">No activity has been recorded yet.</p>}</div>
  }

  function ManifestRow({ m, receiveMode }: {m: Manifest; receiveMode?: boolean}) {
    const ready = m.status === 'Prepared' && !receiveMode && (isLab ? m.direction === 'ToPractice' : front && m.direction === 'ToLab')
    const receiving = receiveMode && ['Dispatched','PartiallyReceived'].includes(m.status) && (isLab ? m.direction === 'ToLab' : front && m.direction === 'ToPractice')
    return <div className="lab-record" key={m.id}><div className="lab-record-main"><strong>{m.reference}</strong>
      <small>{partnerName(m.laboratoryPartnerId)} · {m.lines.length} items · {time(m.preparedAtUtc)}</small></div>
      <Pill>{label(m.status)}</Pill>
      <button type="button" className="lab-secondary" onClick={() => open('manifestHistory',undefined,m.id)}>Manifest</button>
      {ready && <button type="button" className="lab-primary" onClick={() => open('handover',undefined,m.id)}>Confirm actual handover</button>}
      {receiving && <button type="button" className="lab-primary" onClick={() => {setMarked(m.lines.filter(l=>!l.receivedAtUtc).map(l=>l.laboratoryItemId));open('receive',undefined,m.id)}}>Record actual receipt</button>}
    </div>
  }

  return <div className="lab-module lab-v3">
    <header className="lab-head">
      <div><h1>Laboratory</h1><p>{isLab ? 'Assigned orders and production' : 'Cases, dispatches, deliveries and clinical outcomes'}</p></div>
      <div className="lab-head-actions">
        {admin && <button type="button" className="lab-secondary" onClick={() => open('partner')}><Building2 size={15}/> Add laboratory</button>}
        {admin && data.partners.length > 0 && <button type="button" className="lab-secondary" onClick={() => open('assign')}>Assign technician</button>}
        {dentist && <button type="button" className="lab-primary" disabled={!availablePartners.length} title={!availablePartners.length ? 'Practice administrator must add a laboratory first' : ''} onClick={() => open('order')}><Plus size={16}/> New prescription</button>}
        <button type="button" className="lab-secondary lab-refresh" disabled={busy} onClick={() => void load()}><RefreshCw size={16}/> Refresh</button>
      </div>
    </header>
    {error && <div role="alert" className="lab-alert lab-error"><AlertTriangle size={18}/>{error}</div>}
    {notice && <div role="status" className="lab-alert lab-success"><CheckCircle2 size={18}/>{notice}</div>}

    {!loading && section !== 'orders' && data.partners.length === 0 && !isLab && <div className="lab-setup-banner">
      <div className="lab-setup-icon"><Building2 size={21}/></div><div className="lab-setup-text"><strong>{admin ? 'Add your first laboratory partner' : 'Laboratory setup required'}</strong>
        <p>{admin ? 'Enter the real laboratory name and contact details. No example records will be created.' : 'A practice administrator needs to add an active laboratory before a dentist can create a prescription.'}</p></div>
        {admin && <button type="button" className="lab-primary" onClick={() => open('partner')}><Plus size={15}/> Add laboratory</button>}
      </div>}
    {!loading && section !== 'orders' && isLab && data.partners.length === 0 && <div className="lab-setup-banner"><ShieldCheck size={21}/><div className="lab-setup-text"><strong>No laboratory assignment yet</strong><p>Ask the practice administrator to assign your account to your laboratory. No practice-wide cases are shown.</p></div></div>}

    <nav className="lab-tabs" aria-label="Laboratory work areas">
      {nav.map(n => <button type="button" key={n.id} className={'lab-tab '+((section===n.id || (section==='case' && n.id==='orders'))?'active':'')}
        onClick={() => {setSection(n.id);setMarked([]);setError('')}}><n.Icon size={16}/><span>{n.name}</span>{Boolean(n.count) && <span className="lab-count">{n.count}</span>}</button>)}
    </nav>
    {loading ? <div className="lab-panel lab-loading">Loading laboratory records…</div> : <div className="lab-workspace">
      {section === 'orders' && <>
        {data.orders.length > 0 && <div className="lab-status-strip" aria-label="Current laboratory activity">
          <div><strong>{data.orders.filter(o=>o.status!=='Closed').length}</strong><span>Open orders</span></div>
          <div><strong>{eligibleToLab.length}</strong><span>Awaiting dispatch</span></div>
          <div><strong>{clinicalQa.length}</strong><span>QA required</span></div>
          <div><strong>{fitmentQueue.length}</strong><span>Ready for fitment</span></div>
        </div>}
        {front && labNeeded.length > 0 && <section className="lab-panel">
          <div className="lab-section-head"><div><h2>Patients needing lab work</h2><p>Agreed treatment plans with procedures that require the laboratory. Create a laboratory order for each.</p></div></div>
          <div className="lab-table-wrap"><table className="lab-table"><thead><tr><th>Patient</th><th>Procedure</th><th>Tooth</th><th>Plan</th></tr></thead><tbody>
            {labNeeded.map(item => <tr key={item.procedureId}><td><strong>{item.patientName}</strong></td><td>{item.description}</td><td>{item.toothCode ?? '—'}</td><td>{item.planTitle}</td></tr>)}
          </tbody></table></div>
        </section>}
        <section className="lab-panel">
          <div className="lab-section-head"><div><h2>Laboratory orders</h2><p>Each order is linked to a registered patient and can contain multiple independently tracked items.</p></div>
            <label className="lab-search"><Search size={17}/><input aria-label="Search laboratory cases" placeholder="Search by case, patient or laboratory" value={caseSearch} onChange={e=>setCaseSearch(e.target.value)}/></label></div>
          {data.orders.filter(o => `${o.reference} ${o.patientName} ${partnerName(o.laboratoryPartnerId)}`.toLowerCase().includes(caseSearch.toLowerCase())).length ?
            <div className="lab-table-wrap"><table className="lab-table"><thead><tr><th>Order / Patient</th><th>Laboratory</th><th>Items</th><th>Progress</th><th>Status</th><th></th></tr></thead><tbody>
              {data.orders.filter(o => `${o.reference} ${o.patientName} ${partnerName(o.laboratoryPartnerId)}`.toLowerCase().includes(caseSearch.toLowerCase())).map(o => <tr key={o.id}>
                <td><strong className="lab-ref">{o.reference}</strong><small>{o.patientName}</small></td><td>{partnerName(o.laboratoryPartnerId)}</td>
                <td>{o.items.length}</td><td>{completedCount(o)} of {o.items.length} clinically complete</td><td><Pill>{label(o.status)}</Pill></td>
                <td><button type="button" className="lab-open-case" onClick={() => openCase(o.id)}>Open <ChevronRight size={15}/></button></td></tr>)}</tbody></table></div> :
            <div className="lab-empty lab-empty-large"><ClipboardList size={27}/><strong>{caseSearch ? 'No matching laboratory orders' : 'No laboratory orders yet'}</strong>
              <p>{caseSearch ? 'Try a different patient, case reference or laboratory.' : isLab ? 'New work appears here after an assigned practice physically dispatches an order.' : !availablePartners.length ? 'Add an active laboratory first. Then the dentist can prescribe actual work.' : dentist ? 'Create a prescription for a registered patient to begin tracking the case.' : 'Dentists create and approve prescriptions. You can then dispatch them from this workspace.'}</p>
              {!caseSearch && dentist && availablePartners.length > 0 && <button className="lab-primary" type="button" onClick={()=>open('order')}><Plus size={15}/> Create prescription</button>}
              {!caseSearch && admin && !availablePartners.length && <button className="lab-primary" type="button" onClick={()=>open('partner')}><Plus size={15}/> Add laboratory</button>}</div>}
        </section>
      </>}

      {section === 'case' && order && <>
        <div className="lab-case-heading"><button className="lab-secondary" type="button" onClick={()=>setSection('orders')}><ArrowLeft size={15}/> All orders</button><div><h2>{order.reference}</h2><p>{order.patientName} · {partnerName(order.laboratoryPartnerId)}</p></div><Pill>{label(order.status)}</Pill>
          <button type="button" className="lab-secondary" onClick={()=>window.print()}><Printer size={15}/> Print</button></div>
        <div className="lab-case-grid"><section className="lab-panel"><div className="lab-section-head"><div><h3>Items and clinical outcomes</h3><p>Each tooth or appliance has its own manufacturing, custody, QA and fitment history.</p></div><strong className="lab-progress-count">{completedCount(order)} / {order.items.length} completed</strong></div>
          {selectedOrderItems.map(i => <article className={'lab-case-item '+(item?.id===i.id?'selected':'')} key={i.id}>
            <div className="lab-case-item-head"><div><strong>{i.toothCode ? `Tooth ${i.toothCode}` : 'Appliance'} · {i.procedure}</strong><small>{i.isRemovable ? 'Removable appliance' : 'Fixed restoration / item'}{i.expectedAtUtc ? ` · Expected ${time(i.expectedAtUtc)}` : ''}</small></div><Pill>{i.clinicalStatus==='Completed'?'Clinically complete':label(i.clinicalStatus)}</Pill></div>
            <div className="lab-status-grid"><div><span>Manufacture</span><Pill>{label(i.manufacturingStatus)}</Pill></div><div><span>Custody</span><Pill>{label(i.custodyStatus)}</Pill></div><div><span>Practice QA</span><Pill>{label(i.qaStatus)}</Pill></div></div>
            <ItemControls current={i}/>
            {(dentist || isLab) && <div className="lab-evidence-row"><button type="button" className="lab-text-link" onClick={()=>setItemId(i.id)}>{item?.id===i.id?'Showing evidence below':'View linked photos & documents'}</button></div>}
          </article>)}
          {dentist && order.status !== 'Closed' && <div className="lab-case-footer"><div><strong>Clinical closure</strong><small>{readyToClose(order) ? 'Every item meets the documented completion requirements.' : 'Closure becomes available after authorised QA, clinical completion and any required patient handover.'}</small></div><button type="button" className="lab-primary" disabled={!readyToClose(order)} onClick={()=>open('close')}>Close order</button></div>}
          {item && <div className="lab-evidence"><h3>Evidence · Tooth {item.toothCode}</h3>
            {data.evidence.filter(e=>e.laboratoryItemId===item.id).length ? <div className="lab-chip-row">{data.evidence.filter(e=>e.laboratoryItemId===item.id).map(e=><a key={e.id} className="lab-evidence-link" href={`/api/laboratory/evidence/${e.id}`} target="_blank" rel="noreferrer"><FileText size={17}/>{e.fileName}</a>)}</div> : <p>No evidence files attached.</p>}</div>}
        </section><section className="lab-panel lab-side-panel"><h3>Case activity</h3><p>Time-stamped clinical and custody events, retained under the original order.</p><EventHistory orderFilter={order.id}/></section></div>
      </>}
      {section === 'case' && !order && <div className="lab-panel lab-empty">This laboratory order is no longer available. <button className="lab-secondary" type="button" onClick={()=>setSection('orders')}>Back to orders</button></div>}

      {section === 'dispatch' && <div className="lab-stack"><section className="lab-panel"><div className="lab-section-head"><div><h2>{isLab?'Finished work ready to return':'Ready for laboratory dispatch'}</h2><p>Select actual ready items. A separate manifest is prepared per laboratory destination; preparation does not transfer custody.</p></div></div>
        {transferItems.length ? <><div className="lab-table-wrap"><table className="lab-table"><thead><tr><th></th><th>Order / Patient</th><th>Item</th><th>Laboratory</th><th>Status</th><th></th></tr></thead><tbody>{transferItems.map(i=><tr key={i.id}><td><input aria-label={`Select ${i.order.reference} ${i.toothCode}`} type="checkbox" checked={marked.includes(i.id)} onChange={()=>selected(i.id)} disabled={busy}/></td><td><strong>{i.order.reference}</strong><small>{i.order.patientName}</small></td><td>Tooth {i.toothCode} · {i.procedure}</td><td>{partnerName(i.order.laboratoryPartnerId)}</td><td><Pill>{label(i.manufacturingStatus)}</Pill></td><td><button className="lab-text-link" type="button" onClick={()=>openCase(i.order.id,i.id)}>Details</button></td></tr>)}</tbody></table></div>
        <div className="lab-panel-footer"><span>{marked.filter(id=>transferItems.some(i=>i.id===id)).length} item(s) selected</span><button className="lab-primary" type="button" disabled={!marked.some(id=>transferItems.some(i=>i.id===id)) || busy} onClick={()=>void groupSelection(isLab?'ToPractice':'ToLab')}><Plus size={15}/> Prepare manifest</button></div></> : <p className="lab-empty">No items are eligible for dispatch at this stage.</p>}</section>
        <section className="lab-panel"><h3>{isLab?'Outgoing manifests':'Collection manifests'}</h3><p>Confirm handover only when a real collector physically receives the listed packages.</p>{transferManifests.length?transferManifests.map(m=><ManifestRow key={m.id} m={m}/>):<div className="lab-empty">No manifests prepared yet.</div>}</section></div>}

      {section === 'receiving' && <div className="lab-stack"><section className="lab-panel"><h2>{isLab?'Incoming deliveries':'Receive completed work'}</h2><p>Physical receipt is recorded separately from laboratory inspection and practice clinical QA.</p>
        {receiptManifests.length ? receiptManifests.map(m=><ManifestRow key={m.id} m={m} receiveMode/>):<p className="lab-empty">No deliveries available for receiving.</p>}
      </section><section className="lab-panel"><h3>{isLab?'Inspect received impressions':'Clinical quality assessment'}</h3><p>{isLab?'Accept or reject each item before manufacture.' : 'The treating dentist records an independent clinical QA result after physical receipt.'}</p>
        {(isLab?labIntake:clinicalQa).length?(isLab?labIntake:clinicalQa).map(i=><div className="lab-record" key={i.id}><div className="lab-record-main"><strong>{i.order.reference} · Tooth {i.toothCode}</strong><small>{i.procedure} · {i.order.patientName}</small></div><Pill>{isLab?'Awaiting inspection':'QA pending'}</Pill>
          <button className="lab-secondary" type="button" onClick={()=>openCase(i.order.id,i.id)}>View case</button>{(isLab||dentist)&&<button className="lab-primary" type="button" onClick={()=>open(isLab?'intake':'qa',i.id)}>{isLab?'Inspect item':'Record QA'}</button>}</div>):<p className="lab-empty">No items require review right now.</p>}
      </section></div>}

      {section === 'production' && <div className="lab-panel"><h2>Manufacturing progress</h2><p>Every accepted item progresses independently. Delays are recorded with notes; clinical completion remains separate.</p>
        {fabrication.length ? fabrication.map(i=><div className="lab-record" key={i.id}><div className="lab-record-main"><strong>{i.order.reference} · Tooth {i.toothCode}</strong><small>{i.procedure}{i.expectedAtUtc?` · Expected ${time(i.expectedAtUtc)}`:''}</small></div><Pill>{label(i.manufacturingStatus)}</Pill><button className="lab-secondary" type="button" onClick={()=>openCase(i.order.id,i.id)}>View</button><button className="lab-primary" type="button" onClick={()=>open('production',i.id)}>Update progress</button></div>) : <p className="lab-empty">No accepted items currently in production.</p>}
      </div>}

      {section === 'fitment' && <div className="lab-stack"><section className="lab-panel"><h2>Clinical fitment</h2><p>Only QA-passed items physically at the practice can be fitted. Each tooth is completed separately.</p>
        {fitmentQueue.length?fitmentQueue.map(i=><div className="lab-record" key={i.id}><div className="lab-record-main"><strong>{i.order.reference} · Tooth {i.toothCode}</strong><small>{i.order.patientName} · {i.procedure}</small></div><Pill>QA passed</Pill><button type="button" className="lab-primary" onClick={()=>open('fit',i.id)}>Record clinical outcome</button></div>):<p className="lab-empty">No items are currently ready for clinical fitment.</p>}</section>
        <section className="lab-panel"><h3>Handover and final closure</h3><p>Fixed restorations require documented chairside acceptance. Removable appliances also require actual patient handover.</p>
          {data.orders.filter(o=>o.status!=='Closed' && o.items.some(i=>i.clinicalStatus==='Completed')).length ? data.orders.filter(o=>o.status!=='Closed' && o.items.some(i=>i.clinicalStatus==='Completed')).map(o=><div className="lab-record" key={o.id}><div className="lab-record-main"><strong>{o.reference} · {o.patientName}</strong><small>{completedCount(o)} of {o.items.length} clinically complete</small></div><Pill>{readyToClose(o)?'Ready to close':'Partially complete'}</Pill><button type="button" className="lab-secondary" onClick={()=>openCase(o.id)}>Inspect</button>{readyToClose(o) && <button className="lab-primary" type="button" onClick={()=>{setOrderId(o.id);open('close')}}>Close order</button>}</div>) : <p className="lab-empty">No orders currently awaiting final closure.</p>}</section></div>}

      {section === 'returns' && <div className="lab-stack"><section className="lab-panel"><h2>Corrections and adjustments</h2><p>Return only the affected item under the original order. Previously completed teeth remain unchanged.</p>
        {data.corrections.length? data.corrections.map(c=>{const i=manifestItem(c.laboratoryItemId);return <div className="lab-record" key={c.id}><div className="lab-record-main"><strong>{i?.order.reference ?? 'Linked laboratory order'} · {i?.toothCode ? `Tooth ${i.toothCode}` : 'Item'}</strong><small>{c.kind==='ImpressionCorrection'?'Pre-manufacture impression correction':'Post-manufacture adjustment / redo'} · {c.reason}</small></div><Pill>{label(c.status)}</Pill>
          {i && <button type="button" className="lab-secondary" onClick={()=>openCase(i.order.id,i.id)}>View case</button>}
          {dentist && c.kind==='ImpressionCorrection' && c.status==='Requested' && <button className="lab-primary" type="button" onClick={()=>open('impression',c.laboratoryItemId)}>Record new impression</button>}
          {front && c.status==='ReplacementPrepared' && <button className="lab-primary" type="button" onClick={()=>setSection('dispatch')}>Prepare dispatch</button>}
        </div>}) : <p className="lab-empty">No corrections or returns have been recorded.</p>}</section>
        {redoQueue.length > 0 && <section className="lab-panel"><h3>Items requiring a clinical redo decision</h3>
          {redoQueue.map(i=><div className="lab-record" key={i.id}><div className="lab-record-main"><strong>{i.order.reference} · Tooth {i.toothCode}</strong><small>{i.procedure} · {i.order.patientName}</small></div><Pill>Defect recorded</Pill>
            {dentist && i.manufacturingStatus!=='RedoRequested' && <button className="lab-primary" type="button" onClick={()=>open('redo',i.id)}>Authorise redo</button>}
            {i.manufacturingStatus==='RedoRequested' && front && <button className="lab-secondary" type="button" onClick={()=>setSection('dispatch')}>Prepare return</button>}
          </div>)}</section>}
      </div>}

      {section === 'history' && <div className="lab-case-grid"><section className="lab-panel"><h2>Dispatch and delivery records</h2><p>Manifests remain linked to their original laboratory cases. Preparation, handover and receipt are separate events.</p>
        {data.manifests.length?data.manifests.map(m=><ManifestRow key={m.id} m={m} receiveMode={false}/>):<p className="lab-empty">No manifests recorded yet.</p>}</section>
        <section className="lab-panel lab-side-panel"><h3>Recent activity</h3><p>Recorded actions and timestamps.</p><EventHistory/></section>
      </div>}
    </div>}
    <div className="lab-security-note"><ShieldCheck size={15}/><span>Laboratory actions are role-controlled. Financial transactions remain in Financials; no charges are created here.</span></div>

    {modal && <Dialog title={{partner:'Add external laboratory',assign:'Assign technician to laboratory',order:'Dentist laboratory prescription',handover:'Confirm physical package handover',receive:'Confirm actual physical receipt',intake:'Inspect impression / item',impression:'Record new clinical impression',production:'Record production progress',qa:'Practice clinical quality assessment',fit:'Dentist clinical fitment',redo:'Return for adjustment / redo',patient:'Patient appliance handover',close:'Close original laboratory order',upload:'Attach clinical evidence',manifestHistory:'Manifest and custody details'}[modal] ?? 'Laboratory action'} onClose={()=>setModal('')}>
      {modal==='manifestHistory' && activeManifest ? <div className="lab-modal-body"><p><strong>{activeManifest.reference}</strong> · {partnerName(activeManifest.laboratoryPartnerId)}</p><Pill>{activeManifest.status}</Pill>
        <p>Direction: {activeManifest.direction==='ToLab'?'Practice → Laboratory':'Laboratory → Practice'}</p>
        <p>Collector: {activeManifest.collectorName ?? 'Not handed over'} · Waybill: {activeManifest.waybill ?? 'Not recorded'}</p>
        <p>Prepared: {time(activeManifest.preparedAtUtc)} · Handover: {time(activeManifest.handedOverAtUtc)} · Receipt: {time(activeManifest.receivedAtUtc)}</p>
        {lines(activeManifest).map(l=><p key={l.laboratoryItemId}>Tooth {l.item?.toothCode} — {l.item?.procedure} — {l.receivedAtUtc ? 'Received ' + time(l.receivedAtUtc) : 'Not received'}</p>)}
        <button className="lab-secondary" onClick={()=>window.print()}><Printer size={15}/> Print manifest</button></div> :
      modal==='upload' ? <form className="lab-modal-body" onSubmit={e=>void submitEvidence(e)}><p>Attach an actual clinical JPG, PNG or PDF to the selected original tooth item. Maximum 8 MB.</p>
        <Field label="Evidence file" required><input type="file" accept="image/jpeg,image/png,application/pdf" required onChange={e=>setUploadFile(e.target.files?.[0] ?? null)}/></Field>
        <button className="lab-primary" disabled={busy || !uploadFile}>Save evidence</button></form> :
      <form className="lab-modal-body" onSubmit={submitModal}>
        {modal==='partner' && <><Field label="Laboratory name" required><input required maxLength={160} value={form.name||''} onChange={e=>set('name',e.target.value)}/></Field><Field label="Contact person"><input maxLength={120} value={form.contact||''} onChange={e=>set('contact',e.target.value)}/></Field><Field label="Phone"><input maxLength={50} value={form.phone||''} onChange={e=>set('phone',e.target.value)}/></Field></>}
        {modal==='assign' && <><p>Technician accounts are only allowed access to their assigned laboratory orders. Provision accounts under Staff Management first.</p>
          <Field label="Laboratory" required><select required value={form.partnerId||''} onChange={e=>set('partnerId',e.target.value)}><option value="">Select lab</option>{data.partners.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="LabTechnician staff account" required><select required value={form.userId||''} onChange={e=>set('userId',e.target.value)}><option value="">Select technician</option>{staff.filter(s=>s.role==='LabTechnician' && s.isActive).map(s=><option key={s.id} value={s.id}>{s.fullName} ({s.email})</option>)}</select></Field></>}
        {modal==='order' && <><p>Create a prescription only after the dentist has clinically assessed and approved the work.</p>
          <Field label="Find patient by name"><input placeholder="Search registered patients…" value={form.patientQuery||''} onChange={e=>set('patientQuery',e.target.value)} /></Field>
          <Field label="Patient" required><select required value={form.patientId||''} onChange={e=>set('patientId',e.target.value)}><option value="">Select registered patient</option>{patients.map(p=><option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select></Field>
          <Field label="Destination laboratory" required><select required value={form.partnerId||''} onChange={e=>set('partnerId',e.target.value)}><option value="">Select laboratory</option>{data.partners.filter(p=>p.isActive).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Dentist instructions" required><textarea required maxLength={5000} rows={3} value={form.instructions||''} onChange={e=>set('instructions',e.target.value)} placeholder="Material, shade, design, due date and clinical requirements…"/></Field>
          <h4>Independent tooth / appliance items</h4>{draftItems.map((d,idx)=><div className="lab-item-editor" key={idx}><input placeholder="FDI tooth / Arch" value={d.toothCode} maxLength={10} required onChange={e=>setDraftItems(v=>v.map((x,k)=>k===idx?{...x,toothCode:e.target.value}:x))}/>
            <input placeholder="Gold inlay, crown, denture…" required maxLength={240} value={d.procedure} onChange={e=>setDraftItems(v=>v.map((x,k)=>k===idx?{...x,procedure:e.target.value}:x))}/>
            <label><input type="checkbox" checked={d.isRemovable} onChange={e=>setDraftItems(v=>v.map((x,k)=>k===idx?{...x,isRemovable:e.target.checked}:x))}/> Removable</label>
            <button type="button" className="lab-icon-button" onClick={()=>setDraftItems(v=>v.length>1?v.filter((_,k)=>k!==idx):v)}><X size={14}/></button></div>)}
          <button type="button" className="lab-secondary" onClick={()=>setDraftItems(v=>[...v,{toothCode:'',procedure:'',isRemovable:false}])}><Plus size={15}/> Add another item</button></>}
        {modal==='handover' && activeManifest && <><p>{activeManifest.reference} · {partnerName(activeManifest.laboratoryPartnerId)}. This action changes custody to <strong>In Transit</strong>.</p>
          <Field label="Collector / courier name" required><input required maxLength={140} value={form.collectorName||''} onChange={e=>set('collectorName',e.target.value)}/></Field>
          <Field label="Waybill / reference"><input maxLength={120} value={form.waybill||''} onChange={e=>set('waybill',e.target.value)}/></Field>
          <Field label="Sealed package count" required><input required min={1} type="number" value={form.packageCount||'1'} onChange={e=>set('packageCount',e.target.value)}/></Field>
          <Field label="Actual handover acknowledgement" required><textarea required maxLength={300} value={form.acknowledgement||''} onChange={e=>set('acknowledgement',e.target.value)} placeholder="Collector physically received these sealed packages at the recorded time…"/></Field></>}
        {modal==='receive' && activeManifest && <><p>Verify every physical piece. Unselected pieces remain in transit; note any missing or damaged pieces.</p>
          {activeManifest.lines.filter(l=>!l.receivedAtUtc).map(l=><label className="lab-check" key={l.laboratoryItemId}><input type="checkbox" checked={marked.includes(l.laboratoryItemId)} onChange={()=>selected(l.laboratoryItemId)}/>
            Tooth {manifestItem(l.laboratoryItemId)?.toothCode} · {manifestItem(l.laboratoryItemId)?.procedure}</label>)}
          <Field label="Receiver name" required><input required maxLength={140} value={form.receiverName||''} onChange={e=>set('receiverName',e.target.value)}/></Field>
          <Field label="Missing / damaged pieces (if any)"><textarea maxLength={2000} value={form.discrepancy||''} onChange={e=>set('discrepancy',e.target.value)}/></Field></>}
        {modal==='intake' && <><Field label="Technical decision" required><select required value={form.decision||''} onChange={e=>set('decision',e.target.value)}><option value="">Select result</option><option value="Accept">Accept for manufacture</option><option value="Reject">Reject impression — correction required</option></select></Field>
          <Field label="Actual inspection notes" required><textarea required maxLength={2000} rows={3} value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></Field></>}
        {modal==='impression' && <><p>Only record this after the replacement impression or scan was actually taken by the dentist.</p>
          <Field label="New impression / scan procedure notes" required><textarea required maxLength={3000} rows={3} value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></Field></>}
        {modal==='production' && item && <><p>Current stage: {label(item.manufacturingStatus)}</p>
          <Field label="Next production stage" required><select required value={form.stage||''} onChange={e=>set('stage',e.target.value)}><option value="">Select stage</option>
            {item.manufacturingStatus==='Accepted' && <option value="InProduction">Start fabrication</option>}
            {item.manufacturingStatus==='InProduction' && <><option value="Complete">Fabrication complete / lab QA passed</option><option value="Delayed">Report issue / delay</option></>}
            {item.manufacturingStatus==='Delayed' && <option value="InProduction">Resume fabrication</option>}</select></Field>
          <Field label="Technician notes" required><textarea required maxLength={2000} rows={3} value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></Field>
          <Field label="Revised expected date"><input type="date" value={form.expectedAtUtc||''} onChange={e=>set('expectedAtUtc',e.target.value)}/></Field></>}
        {modal==='qa' && <><Field label="Practice QA decision" required><select required value={form.qaResult||''} onChange={e=>set('qaResult',e.target.value)}><option value="">Select result</option><option value="Passed">Passed — ready for fitment</option><option value="Failed">Failed — return / redo required</option></select></Field>
          <Field label="Clinical QA findings" required><textarea required maxLength={2000} rows={3} value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></Field></>}
        {modal==='fit' && <><Field label="Actual chairside outcome" required><select required value={form.outcome||''} onChange={e=>set('outcome',e.target.value)}><option value="">Select outcome</option><option value="Fitted">Fitted and clinically accepted</option><option value="NotFitted">Fitment failed — correction required</option></select></Field>
          <Field label="Dentist findings and treatment notes" required><textarea required maxLength={2000} rows={3} value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></Field>
          <Field label="Patient guarantee (ONLY if actually agreed)"><textarea maxLength={1000} value={form.guaranteeNote||''} onChange={e=>set('guaranteeNote',e.target.value)} placeholder="No guarantee is generated automatically"/></Field></>}
        {modal==='redo' && <><p>Only this item will be returned. The parent order and completed items remain unchanged.</p>
          <Field label="Return reason / defect" required><textarea required maxLength={2000} rows={2} value={form.reason||''} onChange={e=>set('reason',e.target.value)}/></Field>
          <Field label="Dentist remake instructions" required><textarea required maxLength={3000} rows={3} value={form.instructions||''} onChange={e=>set('instructions',e.target.value)}/></Field>
          <div className="lab-form-grid"><Field label="Priority"><select value={form.priority||'Standard'} onChange={e=>set('priority',e.target.value)}><option>Standard</option><option>Urgent</option></select></Field>
          <Field label="Required by"><input type="date" value={form.dueAtUtc||''} onChange={e=>set('dueAtUtc',e.target.value)}/></Field></div></>}
        {modal==='patient' && <><Field label="Person actually receiving appliance" required><input required maxLength={160} value={form.receivedByName||''} onChange={e=>set('receivedByName',e.target.value)}/></Field>
          <Field label="Handover notes"><textarea maxLength={1000} value={form.notes||''} onChange={e=>set('notes',e.target.value)}/></Field></>}
        {modal==='close' && order && <><p>Closing <strong>{order.reference}</strong> records dentist-reviewed final clinical completion. This action does not create a patient invoice.</p>
          {order.items.map(i=><p key={i.id}>Tooth {i.toothCode}: {label(i.clinicalStatus)} · QA {i.qaStatus} · {i.isRemovable?'Removable appliance':'Fixed restoration'}</p>)}</>}
        {modal!=='manifestHistory' && <footer className="lab-modal-footer"><button type="button" className="lab-secondary" onClick={()=>setModal('')}>Cancel</button>
          <button type="submit" className="lab-primary" disabled={busy || (modal==='receive' && !marked.length && !form.discrepancy)}>{busy?'Saving…':'Confirm & save'}</button></footer>}
      </form>}
    </Dialog>}
  </div>
}
