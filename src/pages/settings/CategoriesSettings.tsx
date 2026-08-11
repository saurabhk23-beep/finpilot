import { useEffect, useMemo, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Category } from '../../types'
import { Button, Card, Field, Input, Select } from '../../components/ui'
import { colorForCategory } from '../../components/charts/palette'
import { SettingsSectionShell } from './SettingsSectionShell'

export function CategoriesSettings() {
  const [categories, setCategories] = useState<Category[]>([])
  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState('')
  const [mergeFrom, setMergeFrom] = useState('')
  const [mergeTo, setMergeTo] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  async function refresh() {
    setCategories(await ipc.categories.list())
  }
  useEffect(() => {
    refresh()
  }, [])

  const tops = useMemo(() => categories.filter((c) => c.parent_id === null), [categories])
  const subsOf = (topId: number) => categories.filter((c) => c.parent_id === topId)
  const nameOf = (id: number) => categories.find((c) => c.id === id)?.name ?? '?'

  async function addCategory() {
    if (!newName.trim()) return
    await ipc.categories.create({ name: newName.trim(), parent_id: newParent ? Number(newParent) : undefined })
    setNewName('')
    setNewParent('')
    await refresh()
  }

  async function rename(c: Category, name: string) {
    if (name.trim() && name !== c.name) {
      await ipc.categories.update(c.id, { name: name.trim() })
      await refresh()
    }
  }

  async function toggleHide(c: Category) {
    await ipc.categories.update(c.id, { is_hidden: c.is_hidden ? 0 : 1 })
    await refresh()
  }

  async function remove(c: Category) {
    await ipc.categories.delete(c.id)
    await refresh()
  }

  async function doMerge() {
    setStatus(null)
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) {
      setStatus('Pick two different categories to merge.')
      return
    }
    const r = await ipc.categories.merge(Number(mergeFrom), Number(mergeTo))
    setStatus(`Merged — moved ${r.transactionsReassigned} transactions and ${r.rulesReassigned} rules.`)
    setMergeFrom('')
    setMergeTo('')
    await refresh()
  }

  function CategoryRow({ c, indent }: { c: Category; indent?: boolean }) {
    return (
      <div className={`flex items-center gap-2 py-1.5 ${indent ? 'pl-6' : ''}`}>
        <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: colorForCategory(c.name) }} />
        <input
          defaultValue={c.name}
          onBlur={(e) => rename(c, e.target.value)}
          className={`flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-border focus:border-primary focus:outline-none ${
            c.is_hidden ? 'text-slate-400 line-through' : ''
          }`}
        />
        {c.is_system === 1 ? (
          <span className="text-xs text-slate-300">system</span>
        ) : (
          <button type="button" onClick={() => remove(c)} className="text-xs text-negative hover:underline">
            delete
          </button>
        )}
        <button type="button" onClick={() => toggleHide(c)} className="w-12 text-right text-xs text-primary hover:underline">
          {c.is_hidden ? 'unhide' : 'hide'}
        </button>
      </div>
    )
  }

  const custom = categories.filter((c) => c.is_system === 0)

  return (
    <SettingsSectionShell title="Categories" description="Rename, hide, merge, or add your own categories. Default categories can be hidden but not deleted.">
      <Card>
        {tops.map((top) => (
          <div key={top.id} className="border-b border-slate-50 py-1 last:border-0">
            <CategoryRow c={top} />
            {subsOf(top.id).map((sub) => (
              <CategoryRow key={sub.id} c={sub} indent />
            ))}
          </div>
        ))}
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium text-slate-700">Add a category</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Pets" />
          </Field>
          <Field label="Parent (optional)">
            <Select value={newParent} onChange={(e) => setNewParent(e.target.value)}>
              <option value="">— top-level —</option>
              {tops.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Button onClick={addCategory}>Add category</Button>
        </div>
      </Card>

      <Card>
        <p className="mb-1 text-sm font-medium text-slate-700">Merge categories</p>
        <p className="mb-3 text-xs text-slate-400">Moves all transactions and rules from one custom category into another, then deletes the source.</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Merge this (custom only)">
            <Select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)}>
              <option value="">— select —</option>
              {custom.map((c) => (
                <option key={c.id} value={c.id}>{c.parent_id ? `${nameOf(c.parent_id)} › ${c.name}` : c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Into this">
            <Select value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
              <option value="">— select —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.parent_id ? `${nameOf(c.parent_id)} › ${c.name}` : c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="secondary" onClick={doMerge}>Merge</Button>
          {status && <span className="text-sm text-slate-500">{status}</span>}
        </div>
      </Card>
    </SettingsSectionShell>
  )
}
