from pathlib import Path
import re,sys,shutil
root=Path(sys.argv[1]); assets=Path(__file__).parent
page=root/'frontend/src/pages/PatientsPage.tsx'
extras=root/'frontend/src/pages/RegistrationExtras.tsx'
css=root/'frontend/src/pages/PatientsPage.css'
regcss=root/'frontend/src/pages/RegistrationExtras.css'
entity=root/'backend/CurvTabDental.Domain/Entities/PatientRegistrationDetails.cs'
contracts=root/'backend/CurvTabDental.API/Contracts/Contracts.cs'
ctrl=root/'backend/CurvTabDental.API/Controllers/PatientsController.cs'
for f in (page,extras,css,regcss,entity,contracts,ctrl):
    if not f.exists(): sys.exit('STOP: expected file missing: '+str(f))
p=page.read_text();e=extras.read_text();c=css.read_text();r=regcss.read_text();d=entity.read_text();co=contracts.read_text();ct=ctrl.read_text()
if 'CT_REGISTRATION_CLIENT_V3' in p:
    print('Registration UX V3 is already installed; no changes.');sys.exit(0)
if 'CT_REGISTRATION_COMPLETE_V2' not in (root/'backend/CurvTabDental.Infrastructure/Persistence/DentalDbContext.cs').read_text():sys.exit('STOP: registration V2 backend not found')
if 'registrationExtras' not in p or 'RegistrationDeclarationScreen' not in p:sys.exit('STOP: expected registration V2 front-end not found')
def rep(s,a,b,n=1):
    if s.count(a)!=n:raise RuntimeError(f'Expected {n} occurrence(s), got {s.count(a)}: {a[:105]!r}')
    return s.replace(a,b,n)

# Client-approved six-stage journey, no sample screens and no visual step numbering as a menu.
p=rep(p,"  const registrationSteps = [\n    'Personal details',\n    'Contact details',\n    'Responsible person',\n    'Medical history',\n    'Payment & medical aid',\n    'Declaration & signatures',\n    'Review & save',\n  ]", """  // CT_REGISTRATION_CLIENT_V3 — six compact stages per client review.
  const registrationSteps = [
    'Find patient',
    'Personal details',
    'Contact & emergency',
    'Payment & medical aid',
    'Medical history',
    'Review & declaration',
  ]
  const [existingPatientSearch, setExistingPatientSearch] = useState('')
  const [cityTown, setCityTown] = useState('')
  const [suburb, setSuburb] = useState('')
  const [showResponsible, setShowResponsible] = useState(false)
  const locality = getLocality(cityTown, suburb)
  const suburbOptions = getSuburbs(cityTown)
  function setLocation(city: string, area: string) {
    setCityTown(city)
    setSuburb(area)
    const detail = getLocality(city, area)
    updateField('address', [area.trim(), city.trim(), detail.province, 'South Africa'].filter(Boolean).join(', '))
  }""")
# import location module
p=rep(p,"import './PatientsPage.css'", "import './PatientsPage.css'\nimport { getLocality, getSuburbs } from './RegistrationLocality'")
# Replace validation indexes and paths by replacing complete next step method
start=p.index('  function nextRegistrationStep() {');end=p.index('  function previousRegistrationStep() {',start)
p=p[:start]+'''  function nextRegistrationStep() {
    setError('')
    if (registrationStep === 1) {
      if (!form.firstName.trim() || !form.lastName.trim() || patientAge === null) {
        setError('A valid first name, surname and date of birth are required.')
        return
      }
    }
    if (registrationStep === 2) {
      if (form.email.trim() && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(form.email.trim())) {
        setError('Enter a valid email address.')
        return
      }
      if (!cityTown.trim() || !suburb.trim()) {
        setError('Enter the city/town and suburb.')
        return
      }
      if (suburbOptions.length && !suburbOptions.some(x => x.toLowerCase() === suburb.trim().toLowerCase())) {
        setError('Select a suburb belonging to the chosen city/town.')
        return
      }
      if (isMinor && (!registrationExtras.responsibleName.trim() ||
          !registrationExtras.responsibleRelationship.trim() ||
          !registrationExtras.responsiblePhone.trim())) {
        setError('A minor must have parent/guardian contact details.')
        return
      }
    }
    if (registrationStep === 3 && form.paymentMethod === 'MedicalAid' &&
        (!form.medicalAidScheme.trim() || !form.medicalAidMemberNumber.trim())) {
      setError('Medical aid scheme and membership number are required.')
      return
    }
    if (registrationStep === 4 && isMinor) {
      setRegistrationExtras(v => ({...v,signerCapacity:'ParentOrGuardian'}))
    }
    setRegistrationStep(current => Math.min(current + 1, 5))
  }

'''+p[end:]
# Save prompt guards and case below remain the same. prevent step save before review
# new starting step intentionally Find Patient (visual) matches screenshot.
# Change registrations state initialization and reset
p=rep(p,"              setRegistrationStep(0)\n              setRegistrationExtras(initialRegistrationExtras)","              setRegistrationStep(0)\n              setExistingPatientSearch('')\n              setCityTown('')\n              setSuburb('')\n              setShowResponsible(false)\n              setRegistrationExtras(initialRegistrationExtras)")
p=rep(p,"      setForm(emptyForm)\n      setRegistrationExtras(initialRegistrationExtras)","      setForm(emptyForm)\n      setCityTown('')\n      setSuburb('')\n      setRegistrationExtras(initialRegistrationExtras)")
# registration profile additional metadata stored by dedicated additive nullable column
p=rep(p,"          responsibleIdNumber: registrationExtras.responsibleIdNumber.trim() || null,", """          responsibleIdNumber: null,
          profileJson: JSON.stringify({
            title: registrationExtras.title,
            middleNames: registrationExtras.middleNames,
            preferredName: registrationExtras.preferredName,
            previousSurname: registrationExtras.previousSurname,
            pronouns: registrationExtras.pronouns,
            language: registrationExtras.language,
            cityTown, suburb, province: locality.province,
            postalCode: locality.postalCode,
            country: 'South Africa',
            preferredContact: registrationExtras.preferredContact,
            guardianConsent: isMinor ? registrationExtras.guardianConsent : null,
          }),""")
p=rep(p,"          medicalConditions: [registrationExtras.medicalConditions.trim(),", """          medicalConditions: [registrationExtras.medicalConditions.trim(),
            registrationExtras.extraConditions.length ? `Other selected conditions: ${registrationExtras.extraConditions.join(', ')}` : '',
            registrationExtras.hypertension === 'Yes' ? `Hypertension details: medication=${registrationExtras.bpMedicine}; strength=${registrationExtras.bpDose}; frequency=${registrationExtras.bpFrequency}; controlled=${registrationExtras.bpControlled}; recent reading=${registrationExtras.bpRecent}` : '',
            registrationExtras.diabetes === 'Yes' ? `Diabetes details: type=${registrationExtras.diabetesType}; management=${registrationExtras.diabetesManagement}; medication=${registrationExtras.diabetesMedicine}; strength=${registrationExtras.diabetesDose}; frequency=${registrationExtras.diabetesFrequency}; recent low sugar=${registrationExtras.diabetesLowSugar}` : '',""")
# extract original 7 panels and reassemble into 6 stages.
start=p.index('            {registrationStep === 0 && (',p.index('<form onSubmit={handleRegister}'))
end=p.index('            {error && <p role="alert" className="ct-wizard-error">',start)
old=p[start:end]
# capture blocks using line start anchors, each distinct marker. index 2 consists two blocks.
pattern=re.compile(r'(?m)^            \{registrationStep === ([0-6]) && \(')
marks=list(pattern.finditer(old))
blocks={i:[] for i in range(7)}
for idx,m in enumerate(marks):
    text=old[m.start():(marks[idx+1].start() if idx+1<len(marks) else len(old))]
    blocks[int(m.group(1))].append(text)
assert all(blocks[i] for i in range(7)),[ (i,len(v)) for i,v in blocks.items() ]
def changeidx(txt,new): return re.sub(r'(\{registrationStep === )\d+( && \()',lambda m:m.group(1)+str(new)+m.group(2),txt,count=1)
# Personal step: append additional screenshot identifiers; do not add government ID field.
personal=changeidx(blocks[0][0],1)
anchor='                <div className="ct-wizard-grid">'
extra_personal='''                <div className="ct-reg-v3-mini-grid">
                  <label className="ct-reg-label">Title<select value={registrationExtras.title} onChange={event => setRegistrationExtras(v => ({...v,title:event.target.value}))}><option value="">Choose title</option>{['Mr','Mrs','Ms','Miss','Mx','Dr','Prof'].map(t=><option key={t}>{t}</option>)}</select></label>
                  <label className="ct-reg-label">Middle name(s)<input value={registrationExtras.middleNames} onChange={event => setRegistrationExtras(v => ({...v,middleNames:event.target.value}))}/></label>
                  <label className="ct-reg-label">Preferred name<input value={registrationExtras.preferredName} onChange={event => setRegistrationExtras(v => ({...v,preferredName:event.target.value}))}/></label>
                  <label className="ct-reg-label">Previous surname<input value={registrationExtras.previousSurname} onChange={event => setRegistrationExtras(v => ({...v,previousSurname:event.target.value}))}/></label>
                  <label className="ct-reg-label">Preferred pronouns<select value={registrationExtras.pronouns} onChange={event => setRegistrationExtras(v => ({...v,pronouns:event.target.value}))}>{['','He / Him','She / Her','They / Them','Other','Prefer not to say'].map(s=><option key={s} value={s}>{s || 'Not specified'}</option>)}</select></label>
                  <label className="ct-reg-label">Communication language<select value={registrationExtras.language} onChange={event => setRegistrationExtras(v => ({...v,language:event.target.value}))}>{['English','Sesotho','Setswana','isiZulu','isiXhosa','Afrikaans','Sepedi','siSwati','Other'].map(s=><option key={s}>{s}</option>)}</select></label>
                </div>
'''
personal=rep(personal,anchor,extra_personal+anchor)
personal=personal.replace('<h3>Step 1 — Personal details</h3>','<h3>Personal details</h3>')
# Contact step: move responsible within collapsible section, no ID field.
contact=changeidx(blocks[1][0],2)
contact=contact.replace('<h3>Step 2 — Contact details</h3>','<h3>Contact & emergency</h3>')
textarea='''                  <label style={labelStyle}>
                    Residential address
                    <textarea
                      style={fieldStyle}
                      maxLength={500}
                      rows={3}
                      value={form.address}
                      onChange={event => updateField('address', event.target.value)}
                    />
                  </label>'''
location='''                  <div className="ct-reg-v3-location">
                    <label className="ct-reg-label">City / Town *<input list="ct-reg-v3-cities" placeholder="Type city / town" value={cityTown} onChange={event => setLocation(event.target.value,'')}/><datalist id="ct-reg-v3-cities">{['Bloemfontein','Johannesburg','Soweto','Pretoria','Cape Town','Durban','Kimberley','Welkom','Polokwane','Gqeberha','East London','Pietermaritzburg','Rustenburg','Mbombela'].map(x=><option key={x} value={x}/>)}</datalist></label>
                    <label className="ct-reg-label">Suburb *<input list="ct-reg-v3-suburbs" placeholder="Select or enter suburb" value={suburb} onChange={event => setLocation(cityTown,event.target.value)}/><datalist id="ct-reg-v3-suburbs">{suburbOptions.map(x=><option key={x} value={x}/>)}</datalist></label>
                    <small>Province, country and postal code are shown at review. When a postal code cannot be verified, it is left unconfirmed.</small>
                  </div>
                  <label className="ct-reg-label">Preferred contact method<select value={registrationExtras.preferredContact} onChange={event=>setRegistrationExtras(v=>({...v,preferredContact:event.target.value}))}>{['Phone call','SMS','WhatsApp','Email','Other'].map(x=><option key={x}>{x}</option>)}</select></label>'''
contact=rep(contact,textarea,location)
# merge next of kin form within contact step; block 2 first 'step 3' inside h3
emergency=changeidx(blocks[2][0],2).replace('<h3>Step 3 — Next of kin / Emergency contact</h3>','<h3>Emergency contact</h3>')
responsible='''            {registrationStep === 2 && (isMinor || showResponsible) && (
              <RegistrationResponsibleScreen value={registrationExtras} onChange={setRegistrationExtras} isMinor={isMinor} />
            )}
'''
contact_footer='''            {registrationStep === 2 && !isMinor && (
              <label className="ct-reg-v3-toggle"><input type="checkbox" checked={showResponsible} onChange={event=>setShowResponsible(event.target.checked)}/>Add a responsible person / authorised representative (optional for adults)</label>
            )}
'''
# payment originally idx4 => idx3
payment=changeidx(blocks[4][0],3).replace('<h3>Step 4 — Payment & Medical Aid</h3>','<h3>Payment & medical aid</h3>')
# medical originally idx3 => idx4
medical=changeidx(blocks[3][0],4)
# review+declaration both idx5; remove standalone legacy label; put review first to satisfy review and declaration.
review=changeidx(blocks[6][0],5).replace('<h3>Step 7 — Review & Save</h3>','<h3>Review details</h3>')
review=rep(review,'<p><strong>Address:</strong> {form.address || \'Not supplied\'}</p>', '''<p><strong>City/Town:</strong> {cityTown || 'Not supplied'}</p>
                  <p><strong>Suburb:</strong> {suburb || 'Not supplied'}</p>
                  <p><strong>Province:</strong> {locality.province || 'Not confirmed — verify before use'}</p>
                  <p><strong>Postal code:</strong> {locality.postalCode || 'Not confirmed — do not assume'}</p>
                  <p><strong>Country:</strong> South Africa</p>''')
declaration=changeidx(blocks[5][0],5)
find='''            {registrationStep === 0 && (
              <section className="ct-wizard-section">
                <h3>Find existing patient</h3>
                <p>Search your authorised patient directory before creating a new record.</p>
                <label className="ct-reg-label">Search by name<input value={existingPatientSearch} placeholder="Type patient name" onChange={event=>setExistingPatientSearch(event.target.value)}/></label>
                {existingPatientSearch.trim().length >= 2 && (
                  <div className="ct-reg-v3-existing">{patients.filter(x=>`${x.firstName} ${x.lastName}`.toLowerCase().includes(existingPatientSearch.trim().toLowerCase())).slice(0,6).map(x=><button key={x.id} type="button" className="secondary-button" onClick={()=>{setShowRegistration(false);void openPatient(x)}}>{x.firstName} {x.lastName} — Open existing record</button>)}
                    {patients.filter(x=>`${x.firstName} ${x.lastName}`.toLowerCase().includes(existingPatientSearch.trim().toLowerCase())).length===0 && <p>No matches in the currently loaded directory. Confirm before creating a new patient.</p>}
                  </div>
                )}
                <p className="ct-wizard-notice">If no existing patient is found, continue to register a new patient. Duplicate detection also runs when saving.</p>
              </section>
            )}
'''
new=find+personal+contact+emergency+contact_footer+responsible+payment+medical+review+declaration
p=p[:start]+new+p[end:]
p=rep(p,"{duplicateWarning && registrationStep === 6 && (","{duplicateWarning && registrationStep === 5 && (")
p=rep(p,"{registrationStep < 6 ? (","{registrationStep < 5 ? (")
p=rep(p,'Complete all seven sections, review the medical declaration and capture signatures.', 'Complete the six guided stages, including medical history and signed declaration.')
# stronger guardian consent: at save require capacity; existing backend also validates
p=rep(p,"        (isMinor && registrationExtras.signerCapacity === 'Patient')) {", "        (isMinor && (registrationExtras.signerCapacity === 'Patient' || !registrationExtras.guardianConsent))) {")
# at save, guardianConsent validation reflected in form; include for new state; only replace one occurrence
# ensure no other registrationStep wrong indices outside known blocks
# show inline modal overlay with fixed actions, no page-long scrolling
p=rep(p,'{showRegistration && (\n        <section className="panel">','{showRegistration && (\n        <div className="ct-reg-v3-overlay"><section className="panel ct-reg-v3-modal" role="dialog" aria-modal="true" aria-label="New Patient Registration">')
p=rep(p,'          <form onSubmit={handleRegister} noValidate className="ct-wizard-form">','          <form onSubmit={handleRegister} noValidate className="ct-wizard-form">\n          <div className="ct-reg-v3-content">')
p=rep(p,'            {error && <p role="alert" className="ct-wizard-error">', '          </div>\n            {error && <p role="alert" className="ct-wizard-error">')
p=rep(p,'          </form>\n\n        </section>', '          </form>\n\n        </section></div>')
# Store addon profile in a dedicated additive nullable column, not misleading other fields.
d=rep(d,'    public string? ResponsibleIdNumber { get; set; }','    public string? ResponsibleIdNumber { get; set; }\n    public string? ProfileJson { get; set; } // CT_REGISTRATION_CLIENT_V3\n    public bool? GuardianConsent { get; set; }')
co=rep(co,'    [StringLength(40)] public string? ResponsibleIdNumber { get; set; }','    [StringLength(40)] public string? ResponsibleIdNumber { get; set; }\n    [StringLength(4000)] public string? ProfileJson { get; set; }\n    public bool? GuardianConsent { get; set; }')
ct=rep(ct,'                ResponsibleIdNumber = Clean(r.ResponsibleIdNumber),','                ResponsibleIdNumber = null,\n                ProfileJson = Clean(r.ProfileJson),\n                GuardianConsent = r.GuardianConsent,')
ct=rep(ct,'                 string.IsNullOrWhiteSpace(r.ResponsiblePhone) || r.SignerCapacity == "Patient"))', '                 string.IsNullOrWhiteSpace(r.ResponsiblePhone) || r.SignerCapacity == "Patient" || r.GuardianConsent != true))')
# Don't display sensitive signatures to receptionist; existing backend policy remains.

# RegistrationExtrasState: metadata and medical-specific fields
state_add='''  activeTreatment: string
  title: string
  middleNames: string
  preferredName: string
  previousSurname: string
  pronouns: string
  language: string
  preferredContact: string
  extraConditions: string[]
  bpMedicine: string
  bpDose: string
  bpFrequency: string
  bpControlled: string
  bpRecent: string
  diabetesType: string
  diabetesManagement: string
  diabetesMedicine: string
  diabetesDose: string
  diabetesFrequency: string
  diabetesLowSugar: string
  guardianConsent: boolean
'''
e=rep(e,'export interface RegistrationExtrasState {','export interface RegistrationExtrasState {\n'+state_add)
e=rep(e,'export const initialRegistrationExtras: RegistrationExtrasState = {',"""export const initialRegistrationExtras: RegistrationExtrasState = {
  activeTreatment:'Unknown',title:'',middleNames:'',preferredName:'',previousSurname:'',pronouns:'',language:'English',preferredContact:'Phone call',extraConditions:[],
  bpMedicine:'',bpDose:'',bpFrequency:'',bpControlled:'Unknown',bpRecent:'',diabetesType:'Unknown',diabetesManagement:'',diabetesMedicine:'',diabetesDose:'',diabetesFrequency:'',diabetesLowSugar:'Unknown',guardianConsent:false,""")
# hide unnecessary ID even for guardian
line='      <Field label="Responsible person ID / passport (optional)" value={v.responsibleIdNumber} onChange={s=>update(v,cb,\'responsibleIdNumber\',s)}/>'
e=rep(e,line,'')
# Guardian should appear only if minor; adult declaration is patient accuracy/privacy acknowledgement, not guardian consent.
e=rep(e,'    <div className="ct-reg-declaration">\n      <strong>Patient / parent / guardian declaration</strong>', '''    <div className="ct-reg-declaration">
      <strong>{isMinor?'Parent/guardian declaration':'Patient registration declaration'}</strong>''')
e=rep(e,'    <label className="ct-reg-check"><input type="checkbox" checked={v.declarationAccepted}', '''    {isMinor && <label className="ct-reg-check"><input type="checkbox" checked={v.guardianConsent} onChange={event=>cb({...v,guardianConsent:event.target.checked,signerCapacity:'ParentOrGuardian'})}/>I am the parent or legally authorised guardian and I acknowledge that my authority may need verification before treatment. *</label>}
    <label className="ct-reg-check"><input type="checkbox" checked={v.declarationAccepted}''')
# disable signer capacity patient for minor; adult default patient. Keep authorized representative for exceptional adult.
e=rep(e,'<option value="Patient">Patient</option><option value="ParentOrGuardian">Parent or guardian</option><option value="Representative">Authorised representative</option>', '{!isMinor&&<option value="Patient">Patient</option>}<option value="ParentOrGuardian">Parent or guardian</option><option value="Representative">Authorised representative</option>')
# Component remount when minorness changes ensures default signer capacity selection by onchange of age on personal screen
p=rep(p,'<RegistrationDeclarationScreen value={registrationExtras} onChange={setRegistrationExtras} isMinor={isMinor} />','<RegistrationDeclarationScreen value={{...registrationExtras,signerCapacity:isMinor && registrationExtras.signerCapacity === \'Patient\' ? \'ParentOrGuardian\' : registrationExtras.signerCapacity}} onChange={setRegistrationExtras} isMinor={isMinor} />')
# replace medical component with detailed condition-driven compact cards
start=e.index('export function RegistrationMedicalScreen('); end=e.index('function SignaturePad(',start)
new_med='''export function RegistrationMedicalScreen({value:v,onChange:cb}:Omit<Props,'isMinor'>) {
  const other=['Asthma','Heart disease','Epilepsy / seizures','Thyroid condition','Kidney disease','Liver disease','Arthritis','Cancer / cancer treatment','Autoimmune condition','Mental health condition','Other']
  const change=(key:keyof RegistrationExtrasState,value:string)=>update(v,cb,key,value)
  const yesNo=(key:keyof RegistrationExtrasState,label:string)=>
    <label className="ct-reg-v3-question" key={key}><span>{label}</span><select value={String(v[key])} onChange={ev=>change(key,ev.target.value)}>{['Unknown','No','Yes'].map(x=><option key={x}>{x}</option>)}</select></label>
  const detail=(label:string,key:keyof RegistrationExtrasState)=>
    <Field label={label} value={String(v[key])} onChange={s=>change(key,s)}/>
  return <section className="ct-wizard-section ct-reg-section ct-reg-v3-medical">
    <h3>Medical history</h3>
    <p>Patient-supplied answers. A clinician must review and verify them before treatment.</p>
    {yesNo('heartCondition','Are you taking medication or receiving medical treatment? (Relevant conditions below)')}
    <strong>Select any conditions currently being treated</strong>
    <div className="ct-reg-v3-chips">{other.map(c=><label key={c} className={v.extraConditions.includes(c)?'selected':''}><input type="checkbox" checked={v.extraConditions.includes(c)} onChange={ev=>cb({...v,extraConditions:ev.target.checked?[...v.extraConditions,c]:v.extraConditions.filter(x=>x!==c)})}/>{c}</label>)}</div>
    <div className="ct-reg-v3-condition-grid">
      <div className="ct-reg-v3-condition">
        <h4>Hypertension (high blood pressure)</h4>
        {yesNo('hypertension','Taking medication for blood pressure?')}
        {v.hypertension==='Yes'&&<div className="ct-reg-v3-mini-grid">{detail('Medication name(s)','bpMedicine')}{detail('Dose / strength','bpDose')}{detail('How often','bpFrequency')}{detail('Most recent reading (if known)','bpRecent')}
          <label className="ct-reg-label">Blood pressure controlled?<select value={v.bpControlled} onChange={ev=>change('bpControlled',ev.target.value)}>{['Unknown','No','Yes'].map(x=><option key={x}>{x}</option>)}</select></label></div>}
      </div>
      <div className="ct-reg-v3-condition">
        <h4>Diabetes</h4>
        {yesNo('diabetes','Have you been diagnosed with diabetes?')}
        {v.diabetes==='Yes'&&<div className="ct-reg-v3-mini-grid">
          <label className="ct-reg-label">Diabetes type<select value={v.diabetesType} onChange={ev=>change('diabetesType',ev.target.value)}>{['Unknown','Type 1','Type 2','Other'].map(x=><option key={x}>{x}</option>)}</select></label>
          {detail('Management (tablets, insulin, diet, other)','diabetesManagement')}{detail('Medication name(s)','diabetesMedicine')}{detail('Dose / strength','diabetesDose')}{detail('How often','diabetesFrequency')}
          <label className="ct-reg-label">Recent low blood sugar episode?<select value={v.diabetesLowSugar} onChange={ev=>change('diabetesLowSugar',ev.target.value)}>{['Unknown','No','Yes'].map(x=><option key={x}>{x}</option>)}</select></label>
        </div>}
      </div>
    </div>
    <div className="ct-reg-v3-mini-grid">{yesNo('bleedingDisorder','Bleeding disorder / blood thinners?')}{yesNo('infectiousCondition','Relevant infectious conditions?')}</div>
    <div className="ct-reg-v3-mini-grid"><TextArea label="Allergies and reactions" value={v.allergies} onChange={s=>change('allergies',s)}/>
      <TextArea label="Other medications" value={v.medications} onChange={s=>change('medications',s)}/>
      <TextArea label="Other conditions and operations" value={v.medicalConditions} onChange={s=>change('medicalConditions',s)}/>
      <TextArea label="Previous dental history" value={v.dentalHistory} onChange={s=>change('dentalHistory',s)}/></div>
    <TextArea label="Other relevant information" value={v.medicalNotes} onChange={s=>change('medicalNotes',s)}/>
  </section>
}
'''
e=e[:start]+new_med+e[end:]
# Correct the first medical question: not equating treatment to heart disease
old="{yesNo('heartCondition','Are you taking medication or receiving medical treatment? (Relevant conditions below)')}"
new="{yesNo('heartCondition','Heart condition?')}"
e=rep(e,old,new)
# Additional consent only for minors; remove standalone adult guardian hint
# add separate private, immutable disclaimer

styles=(assets/'registration-v3.css').read_text()
c+='\n'+styles
r+='\n/* CT_REGISTRATION_CLIENT_V3 */\n.ct-reg-v3-condition h4{margin:0 0 7px}\n'
# Write only after all validations success; caller backs up.
for f,content in [(page,p),(extras,e),(css,c),(regcss,r),(entity,d),(contracts,co),(ctrl,ct)]:
    f.write_text(content)
    print('Updated:',f.relative_to(root))
shutil.copy2(assets/'RegistrationLocality.ts',root/'frontend/src/pages/RegistrationLocality.ts')
print('ADDITIVE-SCHEMA: PatientRegistrationDetails.ProfileJson must be migrated before using the updated API.')
