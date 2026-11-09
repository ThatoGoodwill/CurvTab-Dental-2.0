CurvTab Dental — Registration Client V3

Based on the supplied CurvTab frontend/backend source and Registration Recovery V2.

Six compact stages:
Find patient / Personal / Contact & emergency / Payment & medical aid /
Medical history / Review & declaration.

Requirements / scope:
- The existing V1 Treatment and V2 Registration installers must already be installed.
- Shows required guardian responsibility/guardian signature only for minors.
- Adults acknowledge their own registration and privacy notice.
- Removes all government ID number inputs from this registration UI.
- Adds preferred names, title, middle names, previous surname, pronouns,
  communication language, preferred contact method.
- Detailed hypertension and diabetes questions persist as patient-supplied
  medical history; the dentist must verify them.
- A compact modal keeps Back / Next / Save visible while editing a step.
- City and suburb suggestions from a limited SA locality list; province auto-fills
  where city is known, country South Africa, postal code intentionally unresolved.
  Never treat locality suggestions as a comprehensive address database.
- Stores profile metadata in a new nullable JSON-text column on the existing
  PatientRegistrationDetails table; all other registration and signature storage
  is preserved. No tables dropped and no patient records reset.
- Backups and compile steps precede additive EF migration. Migration is checked
  for exactly one nullable AddColumn before being applied.
- Changes only Patient Registration and related registration API classes.
- Script must be run in the actual GitHub Codespace, not locally here.
- Stop and inspect logs on any error; do not rerun failed database migrations blindly.

INSTALL:
1. Upload this ZIP to /workspaces/CurvTab-Dental-2.0 in Codespaces.
2. cd /workspaces/CurvTab-Dental-2.0
3. unzip -oq CurvTab-Registration-Client-V3.zip
4. bash registration-client-v3/install.sh

CLINICAL SAFETY:
- Registration declaration is not informed consent for a procedure.
- Guardianship / consent capacity requirements must be legally reviewed for
  local practice policy, particularly for minors who may have independent
  consent rights in specific circumstances.
- Reception may capture questionnaire responses, but confidential clinical
  histories remain restricted by the backend's existing authorisation.

NOT VERIFIED IN THE USER'S LIVE CODESPACE:
A real frontend build, .NET build, migration, live signature capture and
persist/retrieve test must run in the Codespace.
