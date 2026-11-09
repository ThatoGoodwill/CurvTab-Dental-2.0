// CT_SA_SMART_LOCATION_V1
// GeoNames South African populated places + nearby neighbourhood suggestions.
// Never infer postal codes from approximate locality matches.
import directory from './RegistrationSouthAfrica.json'

const normal = (s:string) => s.trim().toLocaleLowerCase()

export function getCities():string[] {
  return directory.cities.map(c => c.name)
}

export function getSuburbs(city:string):string[] {
  return (directory.suburbs as Record<string,string[]>)[normal(city)] ?? []
}

export function getLocality(city:string, _suburb:string):{
  province:string; postalCode:string
} {
  const entry = directory.cities.find(c => normal(c.name) === normal(city))
  return {province:entry?.province ?? '', postalCode:''}
}
