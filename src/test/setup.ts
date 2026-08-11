import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest doesn't run RTL's auto-cleanup unless `globals` is enabled, so do it explicitly.
afterEach(() => {
  cleanup()
})
