#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1])
p=root/'frontend/src/pages/StaffPage.tsx'
s=p.read_text()
if 'LaboratoryAccountsPanel' in s:
 print('PracticeAdmin laboratory accounts already installed.'); sys.exit(0)
checks={
"type StaffRole = 'Receptionist' | 'Dentist'": "type StaffRole = 'Receptionist' | 'Dentist' | 'LabTechnician'",
'<option value="Dentist">Dentist</option>':'<option value="Dentist">Dentist</option>\n              <option value="LabTechnician">Lab Technician</option>',
'Create a login account for a receptionist or dentist.':'Create a login for a receptionist, dentist or laboratory technician.',
}
for a,b in checks.items():
 if s.count(a)!=1: sys.exit('STOP: StaffPage source differs from tested version: '+a)
 s=s.replace(a,b,1)
a="import './StaffPage.css'"
if s.count(a)!=1: sys.exit('STOP: Unexpected StaffPage import section')
s=s.replace(a,"import LaboratoryAccountsPanel from './LaboratoryAccountsPanel'\n"+a,1)
anchor='''      </div>
    </div>
  )
}'''
if s.count(anchor)!=1: sys.exit('STOP: Unexpected StaffPage bottom layout')
s=s.replace(anchor,'''      </div>
      <LaboratoryAccountsPanel />
    </div>
  )
}''',1)
p.write_text(s)
print('Added LabTechnician staff role, laboratory partner and assignment controls to PracticeAdmin.')
