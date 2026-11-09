// CurvTab registration locality suggestions: compact verified mapping only.
// This is a starter city/suburb directory, NOT a complete postal registry.
// Never guess postal codes from a city/suburb: urban vs street delivery codes vary.
const citySuburbs: Record<string,{ province: string; suburbs: string[] }> = {
  Bloemfontein: {province:'Free State',suburbs:['Bayswater','Brandwag','Dan Pienaar','Fichardt Park','Langenhoven Park','Universitas','Westdene','Heidedal','Pellissier','Willows']},
  Johannesburg:{province:'Gauteng',suburbs:['Braamfontein','Melville','Rosebank','Parktown','Sandton','Randburg','Fourways','Alexandra','Houghton','Linden']},
  Soweto:{province:'Gauteng',suburbs:['Diepkloof','Orlando East','Orlando West','Dobsonville','Meadowlands','Pimville','Jabulani','Protea Glen','Dube','Naledi']},
  Pretoria:{province:'Gauteng',suburbs:['Arcadia','Brooklyn','Centurion','Hatfield','Menlyn','Montana','Moot','Sunnyside','Garsfontein','Silverton']},
  'Cape Town':{province:'Western Cape',suburbs:['Bellville','Claremont','Constantia','Durbanville','Khayelitsha','Observatory','Rondebosch','Sea Point','Woodstock','Mitchells Plain']},
  Durban:{province:'KwaZulu-Natal',suburbs:['Berea','Glenwood','Morningside','Musgrave','Overport','Pinetown','Umhlanga','Chatsworth','KwaMashu']},
  Kimberley:{province:'Northern Cape',suburbs:['Beaconsfield','Belgravia','Cassandra','Hadison Park','Homestead','New Park']},
  Welkom:{province:'Free State',suburbs:['Bedelia','Dagbreek','Doorn','Flamingo Park','Riebeeckstad']},
  Polokwane:{province:'Limpopo',suburbs:['Bendor','Flora Park','Ivy Park','Nirvana','Penina Park']},
  Gqeberha:{province:'Eastern Cape',suburbs:['Summerstrand','Walmer','Newton Park','Lorraine','Humewood','Mill Park']},
  'East London':{province:'Eastern Cape',suburbs:['Beacon Bay','Berea','Cambridge','Gonubie','Vincent','Nahoon']},
  Pietermaritzburg:{province:'KwaZulu-Natal',suburbs:['Athlone','Bisley','Cascades','Hayfields','Scottsville']},
  Rustenburg:{province:'North West',suburbs:['Cashan','Geelhoutpark','Protea Park','Safari Gardens']},
  Mbombela:{province:'Mpumalanga',suburbs:['Nelspruit Central','West Acres','Sonheuwel','Steiltes']},
}
function lookup(city:string) {return Object.entries(citySuburbs).find(([n])=>n.toLowerCase()===city.trim().toLowerCase())?.[1]}
export function getSuburbs(city:string):string[] {return lookup(city)?.suburbs ?? []}
export function getLocality(city:string, _suburb:string):{province:string;postalCode:string} {
  return {province:lookup(city)?.province??'',postalCode:''}
}
