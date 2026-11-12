import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import './PasswordInput.css'

type PasswordInputProps = {
  id?: string
  value: string
  onChange: (nextValue: string) => void
  autoComplete?: 'current-password' | 'new-password'
  minLength?: number
  maxLength?: number
  placeholder?: string
  required?: boolean
  disabled?: boolean
}

/** Local-only visibility toggle. Does not store, submit, or log the password. */
export default function PasswordInput({
  id, value, onChange, autoComplete, minLength, maxLength,
  placeholder, required, disabled,
}: PasswordInputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [visible, setVisible] = useState(false)

  return (
    <span className="ct-password-field">
      <input
        id={inputId}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="none"
      />
      <button
        type="button"
        className="ct-password-visibility"
        aria-controls={inputId}
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          setVisible((current) => !current)
        }}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </span>
  )
}
