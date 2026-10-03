import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sanitizeIpcError, UserFacingError } from './errors'

describe('sanitizeIpcError', () => {
  beforeEach(() => {
    // Silence the intentional main-process log during assertions.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('replaces internal errors with a friendly, domain-appropriate message when dev mode is off', () => {
    const out = sanitizeIpcError('import:cas', new Error('SidecarError: casparser is not installed'), false)
    expect(out.message).not.toMatch(/casparser|SidecarError/)
    expect(out.message).toMatch(/couldn.t process that file/i)
  })

  it('falls back to a generic message for unknown domains', () => {
    const out = sanitizeIpcError('mystery:action', new Error('boom internal detail'), false)
    expect(out.message).not.toMatch(/boom internal detail/)
    expect(out.message).toMatch(/something went wrong/i)
  })

  it('passes user-facing errors through unchanged, even when dev mode is off', () => {
    const out = sanitizeIpcError('auth:changePassword', new UserFacingError('Current password is incorrect'), false)
    expect(out.message).toBe('Current password is incorrect')
  })

  it('surfaces the raw error (with type) when dev mode is on', () => {
    const out = sanitizeIpcError('import:cas', new Error('casparser is not installed'), true)
    expect(out.message).toContain('[dev]')
    expect(out.message).toContain('casparser is not installed')
  })

  it('always logs the full error to the main process', () => {
    const spy = vi.spyOn(console, 'error')
    sanitizeIpcError('portfolio:refresh', new Error('yahoo 429'), false)
    expect(spy).toHaveBeenCalledWith('[ipc:portfolio:refresh]', expect.any(Error))
  })
})
