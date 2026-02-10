import { useState, useCallback, useRef, useEffect } from 'react'

function formatDisplayValue(value: number | string, prefix?: string, suffix?: string, decimals?: number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return ''
  const fixed = decimals !== undefined ? num.toFixed(decimals) : num.toString()
  const [intPart, decPart] = fixed.split('.')
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  let result = decPart !== undefined ? `${withCommas}.${decPart}` : withCommas
  if (prefix) result = `${prefix}${result}`
  if (suffix) result = `${result}${suffix}`
  return result
}

interface FormattedInputProps {
  value: number
  onChange: (value: number) => void
  prefix?: string
  suffix?: string
  min?: number
  max?: number
  step?: number | string
  decimals?: number
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function FormattedInput({
  value,
  onChange,
  prefix,
  suffix,
  min,
  max,
  step,
  decimals,
  placeholder,
  className = '',
  disabled = false,
}: FormattedInputProps) {
  const [focused, setFocused] = useState(false)
  const [rawValue, setRawValue] = useState(value.toString())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focused) {
      setRawValue(value.toString())
    }
  }, [value, focused])

  const handleFocus = useCallback(() => {
    setFocused(true)
    setRawValue(value === 0 ? '' : value.toString())
  }, [value])

  const handleBlur = useCallback(() => {
    setFocused(false)
    const parsed = parseFloat(rawValue)
    if (!isNaN(parsed)) {
      onChange(parsed)
    }
  }, [rawValue, onChange])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setRawValue(val)
      const parsed = parseFloat(val)
      if (!isNaN(parsed)) {
        onChange(parsed)
      }
    },
    [onChange],
  )

  return (
    <div className="input-group w-full">
      {prefix && !focused && <span className="input-prefix">{prefix}</span>}
      {suffix && !focused && <span className="input-suffix">{suffix}</span>}
      <input
        ref={inputRef}
        type={focused ? 'number' : 'text'}
        value={focused ? rawValue : formatDisplayValue(value, prefix ? '' : undefined, undefined, decimals)}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        className={`input tabular-nums ${prefix && !focused ? 'has-prefix' : ''} ${suffix && !focused ? 'has-suffix' : ''} ${className}`}
      />
    </div>
  )
}

interface ToggleSwitchProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}

export function ToggleSwitch({ enabled, onChange, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`toggle ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      data-state={enabled ? 'on' : 'off'}
    >
      <span className="toggle-thumb" data-state={enabled ? 'on' : 'off'} />
    </button>
  )
}
