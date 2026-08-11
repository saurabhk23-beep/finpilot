import { useEffect, useMemo, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Category, CategoryRule } from '../../types'
import { Button, Card, Field, Input } from '../../components/ui'
import { CategorySelect } from '../../components/CategorySelect'
import { SettingsSectionShell } from './SettingsSectionShell'

const TYPE_LABELS: Record<CategoryRule['rule_type'], string> = {
  keyword: 'Keyword',
  mcc: 'MCC',
  vpa: 'UPI VPA',
  amount: 'Amount'
}

export function RulesSettings() {
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [pattern, setPattern] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const [r, c] = await Promise.all([ipc.rules.list(), ipc.categories.list()])
    setRules(r)
    setCategories(c)
  }
  useEffect(() => {
    refresh()
  }, [])

  const catName = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    return (id: number) => {
      const c = byId.get(id)
      if (!c) return '?'
      return c.parent_id ? `${byId.get(c.parent_id)?.name ?? '?'} › ${c.name}` : c.name
    }
  }, [categories])

  async function add() {
    setError(null)
    if (!pattern.trim() || categoryId == null) {
      setError('Enter a pattern and pick a category.')
      return
    }
    await ipc.rules.create({ rule_type: 'keyword', pattern: pattern.trim(), category_id: categoryId, priority: 20 })
    setPattern('')
    setCategoryId(null)
    await refresh()
  }

  async function remove(id: number) {
    await ipc.rules.delete(id)
    await refresh()
  }

  // User-created rules first, then by type.
  const sorted = [...rules].sort(
    (a, b) => b.is_user_created - a.is_user_created || a.rule_type.localeCompare(b.rule_type) || b.priority - a.priority
  )

  return (
    <SettingsSectionShell title="Categorization rules" description="The rules that auto-categorize your transactions. Add keyword rules or remove ones you don't want.">
      <Card>
        <p className="mb-3 text-sm font-medium text-slate-700">Add a keyword rule</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Pattern (regex or text)" required>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="STARBUCKS|CCD" />
          </Field>
          <Field label="Category" required>
            <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} className="w-full py-2 text-sm" />
          </Field>
        </div>
        {error && <p className="mt-3 text-sm text-negative">{error}</p>}
        <div className="mt-4">
          <Button onClick={add}>Add rule</Button>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Pattern</th>
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 text-right font-medium">Priority</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="py-1.5 pr-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{TYPE_LABELS[r.rule_type]}</span>
                    {r.is_user_created === 1 && <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-primary">yours</span>}
                  </td>
                  <td className="max-w-xs truncate py-1.5 pr-3 font-mono text-xs" title={r.pattern}>{r.pattern}</td>
                  <td className="py-1.5 pr-3 text-slate-600">{catName(r.category_id)}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-400">{r.priority}</td>
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => remove(r.id)} className="text-xs text-negative hover:underline">
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </SettingsSectionShell>
  )
}
