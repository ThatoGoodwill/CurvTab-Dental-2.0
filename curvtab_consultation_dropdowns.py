#!/usr/bin/env python3
"""Add optional quick-select clinical entries to CurvTab Dentist Consultations.

Run from /workspaces/CurvTab-Dental-2.0:
    python3 curvtab_consultation_dropdowns.py

Frontend only: no API, database, existing notes or appointment data touched.
Existing typed notes remain editable; choices are not clinical defaults.
"""
from pathlib import Path
from datetime import datetime, timezone
import shutil
import sys

root = Path.cwd()
page = root / "frontend/src/pages/DentistConsultationsPage.tsx"
css = root / "frontend/src/pages/DentistClinical.css"
if not page.is_file() or not css.is_file():
    sys.exit("ERROR: Expected Phase 2 files not found. Run from the CurvTab project root.")

source = page.read_text(encoding="utf-8")
styles = css.read_text(encoding="utf-8")
if "const clinicalSuggestions: Record<FieldName, readonly string[]>" in source:
    print("Already installed. No changes made.")
    sys.exit(0)

old_fields = '''                <h3>Clinical Notes</h3>
                <div className="clinical-field-grid">
                  {fields.map(field => (
                    <label className="clinical-label" key={field.key}>
                      {field.label}{field.required && <span aria-hidden="true"> *</span>}
                      <textarea rows={3} maxLength={6000}
                        placeholder={field.hint}
                        value={form[field.key]} disabled={!editable || saving}
                        onChange={event => setForm(previous => ({ ...previous, [field.key]: event.target.value }))}/>
                    </label>
                  ))}
                </div>'''

new_fields = '''                <h3>Clinical Notes</h3>
                <p className="clinical-quick-help">
                  Quick options are optional prompts, not automatic findings or diagnoses.
                  Select only what you assessed or performed, then add tooth numbers, clinical
                  details and corrections in the editable notes before saving.
                </p>
                <div className="clinical-field-grid">
                  {fields.map(field => (
                    <label className="clinical-label" key={field.key}>
                      {field.label}{field.required && <span aria-hidden="true"> *</span>}
                      <select
                        defaultValue=""
                        aria-label={`Quick-select option for ${field.label}`}
                        disabled={!editable || saving}
                        onChange={event => {
                          const selected = event.currentTarget.value
                          if (selected) addClinicalSuggestion(field.key, selected)
                          event.currentTarget.value = ''
                        }}
                      >
                        <option value="">Choose a common option (optional)</option>
                        {clinicalSuggestions[field.key].map(option => (
                          <option value={option} key={option}>{option}</option>
                        ))}
                      </select>
                      <textarea rows={3} maxLength={6000}
                        placeholder={`${field.hint}. You may type or edit freely.`}
                        value={form[field.key]} disabled={!editable || saving}
                        onChange={event => setForm(previous => ({ ...previous, [field.key]: event.target.value }))}/>
                    </label>
                  ))}
                </div>'''

old_charge = '''                    <label className="clinical-label">Treatment / service
                      <input value={row.description} maxLength={200} disabled={!editable || saving}
                        placeholder="e.g. Consultation"
                        onChange={event => { const value = event.target.value;
                          setCharges(prev => prev.map((item, i) => i === index ? { ...item, description: value } : item))
                          setChargesConfirmed(false)
                        }} />
                    </label>'''

new_charge = '''                    <label className="clinical-label">Treatment / service
                      <select
                        defaultValue=""
                        aria-label={`Choose treatment/service for charge ${index + 1}`}
                        disabled={!editable || saving}
                        onChange={event => {
                          const selected = event.currentTarget.value
                          if (selected) {
                            setCharges(prev => prev.map((item, i) =>
                              i === index ? { ...item, description: selected } : item))
                            setChargesConfirmed(false)
                          }
                          event.currentTarget.value = ''
                        }}
                      >
                        <option value="">Choose common service (optional)</option>
                        {commonTreatments.map(treatment => (
                          <option key={treatment} value={treatment}>{treatment}</option>
                        ))}
                      </select>
                      <input value={row.description} maxLength={200} disabled={!editable || saving}
                        placeholder="Describe treatment; include tooth/site if relevant"
                        onChange={event => { const value = event.target.value;
                          setCharges(prev => prev.map((item, i) => i === index ? { ...item, description: value } : item))
                          setChargesConfirmed(false)
                        }} />
                    </label>'''

suggestions = '''// Optional, editable clinical phrases. Never preselect these or treat them as diagnoses.
const clinicalSuggestions: Record<FieldName, readonly string[]> = {
  chiefComplaint: [
    'Routine dental examination / check-up',
    'Toothache — specify tooth and duration',
    'Sensitivity to hot or cold — specify tooth',
    'Bleeding gums',
    'Swelling in mouth or face — specify site',
    'Broken or chipped tooth — specify tooth',
    'Loose tooth — specify tooth',
    'Difficulty chewing',
    'Orthodontic / braces consultation',
    'Follow-up for previous treatment',
  ],
  symptoms: [
    'Pain when biting or chewing — specify site',
    'Pain with hot or cold stimuli — specify site',
    'Spontaneous pain — specify onset and duration',
    'Bleeding when brushing or flossing',
    'Swelling — specify onset and site',
    'Difficulty opening mouth',
    'Reported discomfort from orthodontic appliance',
    'Patient reports no current symptoms',
  ],
  examinationFindings: [
    'Caries observed — record tooth and surface',
    'Gingival inflammation observed — document sites',
    'Plaque / calculus noted — document sites',
    'Fractured tooth or restoration — record tooth',
    'Tenderness on percussion — specify tooth',
    'Soft-tissue finding — describe site and appearance',
    'No visible abnormalities on examination performed',
    'Further examination or imaging required — specify why',
  ],
  diagnosis: [
    'Dental caries — specify affected teeth',
    'Gingivitis — specify findings',
    'Periodontitis — specify staging and findings',
    'Tooth fracture — specify tooth and type',
    'Suspected pulpal pathology — confirm assessment',
    'Dental infection / abscess — specify site and evidence',
    'Malocclusion — specify classification and findings',
    'Diagnosis pending further evaluation',
  ],
  treatmentPerformed: [
    'Oral examination and consultation',
    'Scaling and polishing — specify sites',
    'Direct restoration — specify tooth, surfaces and material',
    'Extraction — specify tooth and procedure details',
    'Root canal procedure — specify tooth and stage',
    'Temporary restoration — specify tooth',
    'Radiograph obtained / reviewed — specify type and findings',
    'Oral hygiene education and instruction',
    'No procedure performed during this visit',
  ],
  treatmentPlan: [
    'Clinical review planned — specify interval',
    'Restoration planned — specify tooth and surfaces',
    'Professional cleaning planned',
    'Endodontic assessment / treatment considered',
    'Extraction assessment — specify tooth',
    'Orthodontic assessment recommended',
    'Further diagnostic imaging / tests planned',
    'Referral considered — specify indication',
    'No additional treatment planned at this visit',
  ],
  prescriptionNotes: [
    'No medication prescribed at this visit',
    'Medication discussed; details documented separately',
    'Signed prescription issued; document prescribed medicine and instructions',
    'Medication decision deferred pending clinical review',
    'Medication history reviewed; update medical record if required',
  ],
  followUpAdvice: [
    'Routine dental recall recommended — specify interval',
    'Follow-up appointment advised — specify date / interval',
    'Oral hygiene instructions provided',
    'Post-procedure care instructions provided — specify advice',
    'Return or contact practice if symptoms worsen',
    'Referral follow-up recommended — specify provider',
    'No scheduled follow-up required at this time',
  ],
}

// Charges are service descriptions only; pricing is entered and verified by staff.
const commonTreatments: readonly string[] = [
  'Dental consultation / examination',
  'Emergency dental consultation',
  'Scaling and polishing',
  'Composite filling / restoration — specify tooth',
  'Tooth extraction — specify tooth',
  'Root canal treatment — specify tooth and stage',
  'Dental radiograph / X-ray — specify type',
  'Temporary restoration — specify tooth',
  'Orthodontic consultation',
  'Orthodontic adjustment / follow-up',
  'Other service — specify details',
]

'''

add_func = '''  // Insert a quick option while preserving custom text and previous selections.
  function addClinicalSuggestion(field: FieldName, suggestion: string) {
    setForm(previous => {
      const current = previous[field].trim()
      if (current.split('\\n').includes(suggestion)) return previous
      const updated = current ? `${current}\\n${suggestion}` : suggestion
      if (updated.length > 6000) return previous
      return { ...previous, [field]: updated }
    })
  }

'''

anchors = {
    "clinical field markup": (old_fields, new_fields),
    "charge description markup": (old_charge, new_charge),
    "suggestion insertion": ("function localDate(day: Date): string {", suggestions + "function localDate(day: Date): string {"),
    "suggestion helper": ("  async function save(finish = false) {", add_func + "  async function save(finish = false) {"),
}
for label, (old, _new) in anchors.items():
    count = source.count(old)
    if count != 1:
        sys.exit(f"ERROR: Unexpected {label} ({count} matches). No changes made; request a patch for the current version.")

for old, new in anchors.values():
    source = source.replace(old, new, 1)

style_add = '''
/* Phase 2: Quick-select clinical entry prompts and optional service choices. */
.clinical-label select {
  padding: 10px 12px;
  border: 1px solid #cbd9e4;
  background: var(--panel-bg, transparent);
  color: inherit;
  border-radius: 9px;
  font: inherit;
  font-size: 14px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.clinical-label select:disabled { opacity: .7; }
.clinical-quick-help {
  margin: 0;
  color: #65798b;
  line-height: 1.5;
  font-size: 13px;
}
'''
if '/* Phase 2: Quick-select clinical entry prompts' not in styles:
    styles += style_add

backup = root / '.clinical_dropdown_backups' / datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
backup.mkdir(parents=True)
shutil.copy2(page, backup / page.name)
shutil.copy2(css, backup / css.name)
page.write_text(source, encoding='utf-8')
css.write_text(styles, encoding='utf-8')
print('SUCCESS: Quick-select options added to eight consultation fields and charge descriptions.')
print('Existing notes, API methods and patient records are unchanged.')
print(f'Backup saved: {backup}')
print('NEXT: cd frontend && npm run build && npm run lint')
