// Categorical palette for spend categories — distinct, readable on light cards.
const PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#f59e0b', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#65a30d', // lime
  '#ea580c', // orange
  '#0d9488', // teal
  '#9333ea', // purple
  '#ca8a04', // gold
  '#4f46e5', // indigo
  '#e11d48' // rose
]

const UNCATEGORIZED_COLOR = '#94a3b8' // slate

/** Deterministic color for a category name, so the same category keeps its color across charts. */
export function colorForCategory(name: string): string {
  if (name === 'Uncategorized') return UNCATEGORIZED_COLOR
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}
