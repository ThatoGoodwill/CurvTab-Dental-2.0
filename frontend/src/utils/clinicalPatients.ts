import { apiRequest } from '../services/api'

export type ClinicalPatient = { id: string; name: string }

// Matches the existing /api/patients response shapes used by AppointmentsPage.
export async function loadClinicalPatients(): Promise<ClinicalPatient[]> {
  const response = await apiRequest<unknown>('/patients')
  const record = (response && typeof response === 'object' && !Array.isArray(response))
    ? response as Record<string, unknown>
    : null
  const items = Array.isArray(response)
    ? response
    : record?.items ?? record?.patients ?? record?.data ?? record?.results

  if (!Array.isArray(items)) throw new Error('Unable to load the patient directory.')

  return items.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid patient directory response.')
    const item = value as Record<string, unknown>
    if (typeof item.id !== 'string') throw new Error('Patient ID is missing.')
    const name = (typeof item.fullName === 'string' && item.fullName) ||
      (typeof item.name === 'string' && item.name) ||
      [item.firstName, item.lastName].filter((part) => typeof part === 'string').join(' ')
    return { id: item.id, name: name || 'Unnamed patient' }
  })
}
