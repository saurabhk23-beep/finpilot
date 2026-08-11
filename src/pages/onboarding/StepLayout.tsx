import type { ReactNode } from 'react'
import { useOnboardingStore } from '../../stores/onboardingStore'
import { Button } from '../../components/ui'

interface StepLayoutProps {
  title: string
  description?: string
  children: ReactNode
  /** Called before advancing; return false to block (e.g. validation/persist failed). */
  onNext?: () => boolean | Promise<boolean>
  nextLabel?: string
  /** Hide the Skip link when a step is mandatory. */
  canSkip?: boolean
  /** Hide Back on the first step. */
  canGoBack?: boolean
  /** Hide the default Continue button when a step supplies its own primary action (e.g. Summary's Confirm). */
  hideNext?: boolean
  busy?: boolean
}

export default function StepLayout({
  title,
  description,
  children,
  onNext,
  nextLabel = 'Continue',
  canSkip = false,
  canGoBack = true,
  hideNext = false,
  busy = false
}: StepLayoutProps) {
  const next = useOnboardingStore((s) => s.next)
  const back = useOnboardingStore((s) => s.back)
  const stepIndex = useOnboardingStore((s) => s.stepIndex)

  async function handleNext() {
    if (onNext) {
      const ok = await onNext()
      if (!ok) return
    }
    next()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}

      <div className="mt-6">{children}</div>

      <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
        <div>
          {canGoBack && stepIndex > 0 && (
            <Button variant="ghost" onClick={back} disabled={busy}>
              ← Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canSkip && (
            <Button variant="secondary" onClick={next} disabled={busy}>
              Skip
            </Button>
          )}
          {!hideNext && (
            <Button onClick={handleNext} disabled={busy}>
              {busy ? 'Saving…' : nextLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
