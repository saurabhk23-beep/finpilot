import { createHash } from 'crypto'
import { readFileSync } from 'fs'

/** sha256 of a file's bytes — used for import-level dedup against ImportLog. */
export function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** sha256 of a string (for hashing already-read content, e.g. in tests). */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex')
}
