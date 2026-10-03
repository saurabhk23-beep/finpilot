import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Splash from './Splash'
import { useAppStore } from '../stores/appStore'

// Mock the preload bridge the ipc client talks to.
const invoke = vi.fn()

beforeEach(() => {
  invoke.mockReset()
  ;(globalThis as unknown as { window: Window }).window.api = { invoke } as never
  // Reset store to a known first-run state.
  useAppStore.setState({ screen: 'password', isFirstRun: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Splash (first run)', () => {
  it('shows create-vault UI and requires matching passwords', async () => {
    render(<Splash />)
    expect(screen.getByText('Create Vault')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Master password'), 'secret123')
    await user.type(screen.getByPlaceholderText('Confirm password'), 'different')
    await user.click(screen.getByText('Create Vault'))

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('unlocks and routes to onboarding when the vault is created', async () => {
    invoke.mockResolvedValue({ ok: true, onboardingCompleted: false })
    render(<Splash />)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Master password'), 'secret123')
    await user.type(screen.getByPlaceholderText('Confirm password'), 'secret123')
    await user.click(screen.getByText('Create Vault'))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('auth:unlock', { password: 'secret123' })
      expect(useAppStore.getState().screen).toBe('onboarding')
    })
  })
})

describe('Splash (returning user)', () => {
  it('shows an error on wrong password and stays on the password screen', async () => {
    useAppStore.setState({ screen: 'password', isFirstRun: false })
    invoke.mockRejectedValue(new Error('file is not a database'))
    render(<Splash />)

    expect(screen.queryByPlaceholderText('Confirm password')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Master password'), 'wrongpw')
    await user.click(screen.getByText('Unlock'))

    await waitFor(() => expect(screen.getByText('Incorrect password.')).toBeInTheDocument())
    expect(useAppStore.getState().screen).toBe('password')
  })

  it('clears the error as soon as the user edits the password', async () => {
    useAppStore.setState({ screen: 'password', isFirstRun: false })
    invoke.mockRejectedValue(new Error('file is not a database'))
    render(<Splash />)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Master password'), 'wrongpw')
    await user.click(screen.getByText('Unlock'))
    await waitFor(() => expect(screen.getByText('Incorrect password.')).toBeInTheDocument())

    // Typing again should immediately dismiss the stale error.
    await user.type(screen.getByPlaceholderText('Master password'), 'x')
    expect(screen.queryByText('Incorrect password.')).not.toBeInTheDocument()
  })
})
