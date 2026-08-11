import { randomBytes, scryptSync } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

const KEY_LENGTH = 32
const SALT_LENGTH = 16

/** Reads the per-install salt, generating and persisting one on first run. Salts are not secret — only uniqueness matters. */
export function getOrCreateSalt(saltPath: string): string {
  if (existsSync(saltPath)) {
    return readFileSync(saltPath, 'utf-8').trim()
  }
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  mkdirSync(dirname(saltPath), { recursive: true })
  writeFileSync(saltPath, salt, 'utf-8')
  return salt
}

/** Derives a fixed-length hex encryption key from the user's master password. Never persisted. */
export function deriveKey(password: string, saltHex: string): string {
  return scryptSync(password, saltHex, KEY_LENGTH).toString('hex')
}
