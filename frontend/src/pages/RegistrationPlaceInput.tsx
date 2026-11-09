import {useMemo,useState} from 'react'

type Props = {
  label:string
  value:string
  options:string[]
  placeholder:string
  onChange:(value:string)=>void
}

export default function RegistrationPlaceInput({
  label,value,options,placeholder,onChange
}:Props) {
  const [focused,setFocused] = useState(false)
  const query = value.trim().toLocaleLowerCase()

  const results = useMemo(() => {
    if (!query) return []
    return options
      .filter(s => s.toLocaleLowerCase().startsWith(query))
      .slice(0,10)
  },[options,query])

  const exact = options.some(
    s => s.toLocaleLowerCase() === query
  )

  return <label className="ct-reg-label ct-sa-place">
    {label}
    <input
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      onChange={e=>onChange(e.target.value)}
      onFocus={()=>setFocused(true)}
      onBlur={()=>setFocused(false)}
      aria-autocomplete="list"
    />
    {focused && query.length >= 1 && (
      <div className="ct-sa-place-results">
        {results.map(item=>(
          <button
            type="button"
            key={item}
            onMouseDown={e=>e.preventDefault()}
            onClick={()=>{
              onChange(item)
              setFocused(false)
            }}
          >{item}</button>
        ))}
        {!exact && (
          <button
            type="button"
            className="ct-sa-place-other"
            onMouseDown={e=>e.preventDefault()}
            onClick={()=>setFocused(false)}
          >
            Use "{value}" (Other / not listed)
          </button>
        )}
      </div>
    )}
  </label>
}
