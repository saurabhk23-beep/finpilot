import type { ReactNode } from 'react'

/** Consistent heading + description wrapper for each settings sub-page. */
export function SettingsSectionShell({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  )
}
