// CT_REGISTRATION_POSTAL_REVIEW_V1
// Source: South African Post Office domestic postal-code directory.
// Exact town + place matching only; street codes, not PO Box codes.
import codes from './RegistrationPostalCodes.json'

const normal = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toUpperCase()

export function getVerifiedPostalCode(
  town: string,
  suburb: string
): string {
  if (!town.trim() || !suburb.trim()) return ''

  const key = normal(town) + '|' + normal(suburb)
  const directory = codes as Record<string, string>

  return directory[key] ?? ''
}
