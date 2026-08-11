/** Builds a `col = ?, col2 = ?` SET clause + matching values from a partial update object, skipping undefined fields. */
export function buildSetClause<T extends object>(fields: T): { clause: string; values: unknown[] } {
  const entries = Object.entries(fields as Record<string, unknown>).filter(([, v]) => v !== undefined)
  const clause = entries.map(([k]) => `${k} = ?`).join(', ')
  const values = entries.map(([, v]) => v)
  return { clause, values }
}
