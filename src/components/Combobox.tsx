import { useId } from 'react'
import { Input } from './ui'

/** Free-text input with autocomplete suggestions via a native <datalist> — user can pick a listed option or type their own. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
}) {
  const listId = useId()
  return (
    <>
      <Input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </>
  )
}
