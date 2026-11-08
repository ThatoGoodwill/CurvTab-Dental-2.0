#!/usr/bin/env bash
# CurvTab Laboratory Workbench V2: practical workflow navigation + high-contrast light clinical UI.
# No laboratory records, migrations, or subscriptions are modified by this script.
set -Eeuo pipefail
umask 077
ROOT=/workspaces/CurvTab-Dental-2.0
TSX="$ROOT/frontend/src/pages/LaboratoryModule.tsx"
CSS="$ROOT/frontend/src/pages/LaboratoryModule.css"
NOW="$(date -u +%Y%m%d-%H%M%S)"
SAVE="/workspaces/.curvtab-safe-snapshots/lab-ui-before-v2-$NOW"

if [[ ! -f "$TSX" || ! -f "$CSS" || ! -f "$ROOT/frontend/package.json" ]]; then
  echo 'STOP: Laboratory V1 source not found. No files changed.' >&2
  exit 1
fi
if grep -q 'CT_LAB_WORKBENCH_V2' "$TSX"; then
  echo 'Laboratory Workbench V2 is already installed. No changes made.'
  exit 0
fi
mkdir -p "$SAVE"
cp -p "$TSX" "$SAVE/LaboratoryModule.tsx"
cp -p "$CSS" "$SAVE/LaboratoryModule.css"
git -C "$ROOT" status --short > "$SAVE/git-status-before.txt"
cat > "$SAVE/README.txt" <<'EOF'
These are the EXACT source files before Laboratory Workbench V2.
Restore (if needed): cp LaboratoryModule.tsx <repo>/frontend/src/pages/LaboratoryModule.tsx
                     cp LaboratoryModule.css <repo>/frontend/src/pages/LaboratoryModule.css
No database schema changes are part of this installer.
EOF
restore_sources() {
  cp -p "$SAVE/LaboratoryModule.tsx" "$TSX"
  cp -p "$SAVE/LaboratoryModule.css" "$CSS"
  echo "FAILURE: source automatically restored from: $SAVE" >&2
}
trap restore_sources ERR

echo "Backup saved: $SAVE"
ROOT="$ROOT" python3 - <<'PY'
from pathlib import Path
import os
root = Path(os.environ['ROOT'])
p = root/'frontend/src/pages/LaboratoryModule.tsx'
c = root/'frontend/src/pages/LaboratoryModule.css'
s = p.read_text()
css = c.read_text()

def sub(old, new, expected=1):
    global s
    n=s.count(old)
    if n != expected:
        raise SystemExit(f'STOP: Source differs from installer V1. Expected {expected} matches, got {n}: {old[:110]!r}')
    s=s.replace(old,new)

# Large decorative title is removed; its icon is no longer imported.
sub("  FlaskConical, ClipboardList, Truck, PackageCheck, ScanLine,", "  ClipboardList, Truck, PackageCheck, ScanLine,")

# The guide's screen numbers were illustrative, not real navigation labels.
sub("  { n: 1, name: 'Dispatch Centre', role: 'Practice', Icon: ClipboardList },", "  { n: 1, name: 'Prescriptions & dispatch', role: 'Practice', Icon: ClipboardList },")
sub("  { n: 2, name: 'Collection & Handover', role: 'Practice', Icon: Truck },", "  { n: 2, name: 'Collection handover', role: 'Practice', Icon: Truck },")
sub("  { n: 3, name: 'Lab Receive & Inspect', role: 'Laboratory', Icon: ScanLine },", "  { n: 3, name: 'Incoming & inspection', role: 'Laboratory', Icon: ScanLine },")
sub("  { n: 4, name: 'Impression Correction', role: 'Practice', Icon: RotateCcw },", "  { n: 4, name: 'Impression corrections', role: 'Practice', Icon: RotateCcw },")
sub("  { n: 5, name: 'Production & Progress', role: 'Laboratory', Icon: Wrench },", "  { n: 5, name: 'Production progress', role: 'Laboratory', Icon: Wrench },")
sub("  { n: 6, name: 'Finished Work & Dispatch', role: 'Laboratory', Icon: PackageOpen },", "  { n: 6, name: 'Finished work & delivery', role: 'Laboratory', Icon: PackageOpen },")
sub("  { n: 7, name: 'Practice Receive & QA', role: 'Practice', Icon: PackageCheck },", "  { n: 7, name: 'Receive & quality check', role: 'Practice', Icon: PackageCheck },")
sub("  { n: 8, name: 'Clinical Fitment', role: 'Dentist', Icon: Stethoscope },", "  { n: 8, name: 'Clinical fitment', role: 'Dentist', Icon: Stethoscope },")
sub("  { n: 9, name: 'Returns & Redo', role: 'Practice', Icon: RotateCcw },", "  { n: 9, name: 'Returns & adjustments', role: 'Practice', Icon: RotateCcw },")
sub("  { n: 10, name: 'Patient Handover & Closure', role: 'Dentist', Icon: CheckCircle2 },", "  { n: 10, name: 'Handover & closure', role: 'Dentist', Icon: CheckCircle2 },")

sub("  const [screen, setScreen] = useState(isLab ? 3 : dentist ? 8 : 1)", "  const [screen, setScreen] = useState(0) // CT_LAB_WORKBENCH_V2: case-first entry for every role")
sub("  const [form, setForm] = useState<Record<string, string>>({})", "  const [form, setForm] = useState<Record<string, string>>({})\n  const [caseSearch, setCaseSearch] = useState('')")
sub("    setForm({}); setUploadFile(null); setError(''); setModal(name)", "    setForm({}); setUploadFile(null); setError(''); setModal(name)\n    if (name === 'order') setDraftItems([{ toothCode: '', procedure: '', isRemovable: false }])")
sub("  const title = screens.find(s => s.n === screen)?.name ?? 'Laboratory'", "  const title = screen === 0 ? 'Cases & work queues' : screens.find(s => s.n === screen)?.name ?? 'Laboratory'")
old = '''  return <div className="lab-module">
    <header className="lab-hero"><div className="lab-hero-icon"><FlaskConical size={27}/></div><div>
      <span className="lab-overline">CURVTAB DENTAL · CONNECTED LABORATORY EXCHANGE</span>
      <h1>Laboratory Module</h1><p>Prescriptions · custody · production · clinical outcomes · final closure</p>
    </div><span className="lab-mode">{isLab ? 'Restricted Laboratory Partner' : 'Practice Workspace'}</span></header>

    <div className="lab-toolbar"><div><strong>{String(screen).padStart(2,'0')} / 10 · {title}</strong>
      <small>{screens.find(s => s.n === screen)?.role} workflow · saved actions become part of the audit history</small></div>
      <button className="lab-secondary" onClick={() => void load()} disabled={busy}><RefreshCw size={15}/> Refresh</button></div>'''
new = '''  return <div className="lab-module">
    <div className="lab-page-heading">
      <div className="lab-heading-copy">
        <strong>Laboratory</strong>
        <span>{isLab ? 'Your assigned cases, inspections and fabrication' : 'Orders, collections, quality checks and patient outcomes'}</span>
      </div>
      <div className="lab-actions">
        {admin && <button type="button" className="lab-secondary" onClick={() => open('partner')}><Plus size={15}/> Add laboratory</button>}
        {admin && <button type="button" className="lab-secondary" onClick={() => open('assign')}>Assign technician</button>}
        {dentist && <button type="button" className="lab-primary" disabled={!data.partners.some(p=>p.isActive)} onClick={() => open('order')}><Plus size={16}/> New lab prescription</button>}
      </div>
    </div>
    <div className="lab-toolbar"><div><strong>{title}</strong>
      <small>{screen === 0 ? 'Select a case or choose a task. Each physical handover, quality decision and clinical outcome is recorded separately.' : 'All updates remain linked to the original laboratory order.'}</small></div>
      <button type="button" className="lab-secondary" onClick={() => void load()} disabled={busy}><RefreshCw size={15}/> Refresh</button></div>'''
sub(old, new)
old = '''    <div className="lab-layout"><aside className="lab-navigation">
      <div className="lab-nav-heading">LAB WORKFLOW</div>
      {screens.filter(s => canOpen(s.n)).map(s => <button key={s.n} onClick={() => {setScreen(s.n);setMarked([]);setError('')}}
        className={`lab-nav-button ${screen===s.n?'active':''}`}><s.Icon size={17}/><span><small>SCREEN {String(s.n).padStart(2,'0')}</small>{s.name}</span><ChevronRight size={14}/></button>)}
      <div className="lab-nav-foot"><ShieldCheck size={16}/><span>Each action is timestamped. Lab partners see assigned work only.</span></div>
    </aside><main className="lab-main">
      <div className="lab-metrics">{statusCounts.map(c => <div className="lab-metric" key={c.label}><strong>{c.count}</strong><span>{c.label}</span></div>)}</div>
      {loading ? <div className="lab-panel">Loading laboratory records…</div> : <>
      {screen === 1 && <div className="lab-stack">'''
new = '''    <div className="lab-layout"><aside className="lab-navigation" aria-label="Laboratory work queues">
      <div className="lab-nav-heading">WORK QUEUES</div>
      <button type="button" onClick={() => {setScreen(0);setMarked([]);setError('')}}
        className={`lab-nav-button ${screen===0?'active':''}`}><ClipboardList size={17}/><span>Overview & cases</span><ChevronRight size={14}/></button>
      {screens.filter(s => canOpen(s.n)).map(s => <button type="button" key={s.n} onClick={() => {setScreen(s.n);setMarked([]);setError('')}}
        className={`lab-nav-button ${screen===s.n?'active':''}`}><s.Icon size={17}/><span>{s.name}</span><ChevronRight size={14}/></button>)}
      <div className="lab-nav-foot"><ShieldCheck size={16}/><span>Every case keeps its original order, item outcomes and custody history.</span></div>
    </aside><main className="lab-main">
      <div className="lab-metrics">{statusCounts.map(c => <div className="lab-metric" key={c.label}><strong>{c.count}</strong><span>{c.label}</span></div>)}</div>
      {loading ? <div className="lab-panel">Loading laboratory records…</div> : <>
      {screen === 0 && <div className="lab-stack">
        <section className="lab-panel">
          <div className="lab-panel-title"><div><h2>Laboratory cases</h2><p>One order can include multiple teeth. Select a case to inspect each item's manufacturing, receipt, QA and clinical status.</p></div>
          <input aria-label="Search laboratory cases" className="lab-case-search" placeholder="Search case, patient or laboratory" value={caseSearch} onChange={e=>setCaseSearch(e.target.value)}/></div>
          {data.orders.filter(o => `${o.reference} ${o.patientName} ${partnerName(o.laboratoryPartnerId)}`.toLowerCase().includes(caseSearch.toLowerCase())).length ?
            <div className="lab-table-wrap"><table className="lab-table lab-cases-table"><thead><tr><th>Case / Patient</th><th>Laboratory</th><th>Items</th><th>Completed</th><th>Case status</th><th></th></tr></thead><tbody>
              {data.orders.filter(o => `${o.reference} ${o.patientName} ${partnerName(o.laboratoryPartnerId)}`.toLowerCase().includes(caseSearch.toLowerCase())).map(o => <tr key={o.id} className={order?.id===o.id?'lab-selected-row':''}>
                <td><strong>{o.reference}</strong><small>{o.patientName}</small></td>
                <td>{partnerName(o.laboratoryPartnerId)}</td><td>{o.items.length}</td>
                <td>{o.items.filter(i=>i.clinicalStatus==='Completed').length} / {o.items.length}</td>
                <td><Pill>{label(o.status)}</Pill></td>
                <td><button type="button" className="lab-secondary" onClick={()=>{setOrderId(o.id);setItemId('')}}>View case</button></td>
              </tr>)}</tbody></table></div> :
            <div className="lab-empty">{caseSearch ? 'No cases match your search.' : 'No laboratory cases yet. First add a laboratory partner (practice admin), then the dentist can create a prescription.'}</div>}
          {dentist && !data.partners.some(p=>p.isActive) && <p className="lab-guidance">A Practice Administrator must add a destination laboratory before the dentist can prescribe a laboratory order.</p>}
          {admin && !data.partners.length && <button type="button" className="lab-primary" onClick={()=>open('partner')}><Plus size={15}/> Add your first laboratory</button>}
        </section>
        <section className="lab-panel"><h3>What needs action?</h3>
          <div className="lab-task-grid">
            {(isLab ? [
              {id:3, title:'Receive & inspect', desc:'Confirm incoming pieces before deciding whether impressions are suitable.'},
              {id:5, title:'Production', desc:'Track fabrication separately for every tooth or appliance.'},
              {id:6, title:'Dispatch finished work', desc:'Prepare a manifest, then confirm actual handover.'},
            ] : dentist ? [
              {id:1, title:'Prescriptions', desc:'Review approved lab work and its destination.'},
              {id:7, title:'Quality check', desc:'Review returned pieces before fitment.'},
              {id:8, title:'Clinical fitment', desc:'Only fit items accepted by practice QA.'},
              {id:9, title:'Returns & redo', desc:'Return only defective items under the original order.'},
              {id:10, title:'Final closure', desc:'Close after every clinical outcome and required handover.'},
            ] : [
              {id:1, title:'Ready for dispatch', desc:'Prepare separate manifests for each destination.'},
              {id:2, title:'Courier collection', desc:'Record actual physical collection, never just preparation.'},
              {id:7, title:'Receive from laboratory', desc:'Count the pieces physically received; the dentist confirms clinical QA.'},
              {id:9, title:'Returns', desc:'Prepare dentist-authorised returns without a second patient charge.'},
            ]).filter(t=>canOpen(t.id)).map(t=><button type="button" key={t.id} className="lab-task" onClick={()=>{setScreen(t.id);setError('')}}>
              <strong>{t.title}<ChevronRight size={15}/></strong><span>{t.desc}</span></button>)}
          </div>
        </section>
      </div>}
      {screen === 1 && <div className="lab-stack">'''
sub(old, new)
# No duplicate actions in the section; they're now prominent in the page toolbar.
sub('''          <div className="lab-actions">{admin && <button className="lab-secondary" onClick={() => open('partner')}><Plus size={15}/> Add lab</button>}
          {admin && <button className="lab-secondary" onClick={() => open('assign')}>Assign technician</button>}
          {dentist && <button className="lab-primary" onClick={() => open('order')}><Plus size={16}/> New prescription</button>}</div></div>''', '''          </div>''')
sub("No eligible items awaiting laboratory dispatch. {dentist ? 'Create a dentist-approved prescription above.' : 'Ask the dentist to prescribe an order.'}", "No items are ready for physical dispatch. A dentist must first approve a laboratory prescription; existing active jobs may be under another stage.")
# Avoid generic screen-step language remaining in the panel.
sub("<h2>Reception Dispatch Centre</h2>", "<h2>Ready for dispatch</h2>")

# Append strong scoped contrast rules: dark-mode must not turn white card headings white.
css += '''
/* CT_LAB_WORKBENCH_V2: readable light clinical workspace inside either host theme.
   Does NOT change global dashboard colours or any other module. */
.lab-module{--lab-ink:#1b304a;--lab-stroke:#d9e4ee;background:#f5f8fc!important;color:#1b304a!important;border-radius:14px;padding:16px 18px 25px!important}
.lab-module .lab-page-heading{display:flex;gap:15px;align-items:center;justify-content:space-between;padding:2px 2px 14px;margin:0 0 4px;border-bottom:1px solid #dce5f0;flex-wrap:wrap}
.lab-module .lab-heading-copy{display:flex;flex-direction:column;gap:3px}
.lab-module .lab-heading-copy strong{font-size:19px;letter-spacing:-.25px;color:#132e50!important}
.lab-module .lab-heading-copy span{font-size:12px;color:#546c87!important}
.lab-module .lab-toolbar{padding:12px 2px 13px!important}
.lab-module .lab-toolbar strong{font-size:15px!important;color:#203c61!important}
.lab-module .lab-toolbar small{max-width:760px;color:#526c89!important;line-height:1.45}
.lab-module .lab-navigation,.lab-module .lab-panel,.lab-module .lab-metric{background:#ffffff!important;color:#172e4c!important;border:1px solid #dbe5f1!important;box-shadow:0 2px 10px rgba(18,45,76,.035)!important}
.lab-module .lab-panel h1,.lab-module .lab-panel h2,.lab-module .lab-panel h3,.lab-module .lab-panel h4,.lab-module .lab-record strong,.lab-module .lab-closure-items strong{color:#163455!important}
.lab-module .lab-panel p,.lab-module .lab-panel-title p,.lab-module .lab-record small,.lab-module .lab-table small,.lab-module .lab-panel-footer p,.lab-module .lab-closure-items small{color:#526985!important}
.lab-module .lab-panel,.lab-module .lab-panel *, .lab-module .lab-navigation *{text-shadow:none!important}
.lab-module .lab-nav-button{background:transparent!important;color:#284765!important;border-color:transparent!important;gap:10px!important;min-height:39px}
.lab-module .lab-nav-button:hover{background:#eef4fb!important}
.lab-module .lab-nav-button.active{background:#e6f0ff!important;border-color:#bfd7f8!important;color:#114f98!important}
.lab-module .lab-nav-button>span{font-size:12px!important;color:inherit!important}
.lab-module .lab-nav-heading{color:#607c9b!important}
.lab-module .lab-metric strong{color:#1158ad!important}
.lab-module .lab-metric span{color:#526e8a!important}
.lab-module .lab-table{color:#243d5a!important}
.lab-module .lab-table td{background:#fff;color:#243d5a!important}
.lab-module .lab-table th{background:#eef4fb!important;color:#294a6c!important}
.lab-module .lab-table tbody tr:hover td{background:#f2f7ff!important}
.lab-module .lab-selected-row td{background:#eaf3ff!important}
.lab-module .lab-destination,.lab-module .lab-empty,.lab-module .lab-tip{color:#31577c!important}
.lab-module .lab-case-search{min-width:230px;max-width:320px;width:100%;background:#fff!important;color:#193650!important;border:1px solid #c6d8eb!important;border-radius:8px;padding:9px 11px;min-height:38px}
.lab-module .lab-case-search::placeholder{color:#7187a0!important;opacity:1}
.lab-module .lab-guidance{margin:12px 0!important;font-size:12px!important;color:#684a22!important;background:#fff9e8!important;border:1px solid #f4deaf!important;border-radius:8px;padding:10px!important}
.lab-module .lab-task-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:9px;margin-top:15px}
.lab-module .lab-task{display:flex;flex-direction:column;align-items:stretch;text-align:left;gap:7px;padding:13px!important;border:1px solid #d6e3f0!important;border-radius:10px;background:#fff!important;color:#213f62!important}
.lab-module .lab-task:hover{background:#edf5ff!important;border-color:#a7c5e9!important}
.lab-module .lab-task strong{display:flex;justify-content:space-between;align-items:center;color:#174473!important;font-size:13px!important}
.lab-module .lab-task span{color:#58718c!important;font-size:11px!important;line-height:1.5}
.lab-module .lab-field input,.lab-module .lab-field select,.lab-module .lab-field textarea{color:#153451!important;background:#fff!important}
.lab-module .lab-field{color:#264565!important}
.lab-module .lab-modal{background:#fff!important;color:#173854!important}
.lab-module .lab-modal h3,.lab-module .lab-modal h4{color:#163c68!important}
.lab-module .lab-primary{background:#1564c2!important;color:#fff!important;border-color:#1564c2!important}
.lab-module .lab-secondary{background:#fff!important;color:#16549b!important;border-color:#bfd2e8!important}
.lab-module .lab-secondary:hover{background:#ecf4ff!important}
.lab-module .lab-modal-backdrop{color:#163854!important}
@media(max-width:820px){.lab-module .lab-page-heading{align-items:flex-start}.lab-module .lab-case-search{max-width:100%}.lab-module{padding:13px!important}}
@media print{.lab-module{background:white!important;padding:0!important}.lab-module .lab-page-heading{border:0}.lab-module .lab-task-grid{display:none!important}}
'''
p.write_text(s)
c.write_text(css)
print('Patched lab workbench source and scoped light-mode CSS.')
PY

echo 'Building React frontend to verify the changes...'
(cd "$ROOT" && npm run build --prefix frontend)
trap - ERR
cat <<OUT
========================================================
LAB WORKBENCH V2 INSTALLED
- No huge Laboratory Module banner
- No screen numbers or ten-screen progress labels
- Cases first, searchable patient/order work list
- Contextual dentist, practice admin, and technician actions
- High-contrast light cards in both host themes
- Original prescriptions, handovers, QA, redo, fit and closure remain available
- No database, backend, subscriptions or saved patient records changed
Prechange source: $SAVE
========================================================
OUT
