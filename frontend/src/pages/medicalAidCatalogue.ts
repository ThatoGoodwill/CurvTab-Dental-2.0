export type MedicalAidScheme = {
  name: string
  plans: readonly string[]
  website: string
}

export const MEDICAL_AID_SCHEMES: MedicalAidScheme[] = [
  {
    name: 'Government Employees Medical Scheme (GEMS)',
    plans: [
      'Tanzanite One',
      'Beryl',
      'Ruby',
      'Emerald Value',
      'Emerald',
      'Onyx',
    ],
    website: 'https://www.gems.gov.za',
  },
  {
    name: 'Bestmed Medical Scheme',
    plans: [
      'Beat 1',
      'Beat 2',
      'Beat 3',
      'Beat 3 Plus',
      'Beat 4',
      'Pace 1',
      'Pace 2',
      'Pace 3',
      'Pace 4',
      'Rhythm 1',
      'Rhythm 2',
    ],
    website: 'https://www.bestmed.co.za',
  },
  {
    name: 'Bonitas Medical Fund',
    plans: [
      'BonComprehensive',
      'BonClassic',
      'BonComplete',
      'BonCore',
      'BonCap',
      'BonEssential',
      'BonEssential Select',
      'BonPrime',
      'BonStart',
      'BonStart Plus',
      'Hospital Standard',
      'Standard',
      'Standard Select',
      'Primary',
    ],
    website: 'https://www.bonitas.co.za',
  },
]

export const OTHER_SCHEME = '__other_registered_scheme__'
