import { useMemo } from 'react'
import type { Category } from '../types'

/** Grouped category dropdown: top-level categories as optgroups, their sub-categories as options. */
export function CategorySelect({
  categories,
  value,
  onChange,
  className = ''
}: {
  categories: Category[]
  value: number | null
  onChange: (categoryId: number) => void
  className?: string
}) {
  const groups = useMemo(() => {
    const tops = categories.filter((c) => c.parent_id === null && c.is_hidden === 0)
    return tops.map((top) => ({
      top,
      subs: categories.filter((c) => c.parent_id === top.id && c.is_hidden === 0)
    }))
  }, [categories])

  return (
    <select
      value={value ?? ''}
      onChange={(e) => e.target.value && onChange(Number(e.target.value))}
      className={`rounded-md border border-border bg-white px-2 py-1 text-xs outline-none focus:border-primary ${className}`}
    >
      <option value="">Uncategorized</option>
      {groups.map(({ top, subs }) => (
        <optgroup key={top.id} label={top.name}>
          <option value={top.id}>{top.name} (general)</option>
          {subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
