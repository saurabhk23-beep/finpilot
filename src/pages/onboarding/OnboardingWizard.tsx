import { ONBOARDING_STEPS, useOnboardingStore } from '../../stores/onboardingStore'
import ProfileStep from './steps/ProfileStep'
import BankAccountsStep from './steps/BankAccountsStep'
import CreditCardsStep from './steps/CreditCardsStep'
import CashTransactionsStep from './steps/CashTransactionsStep'
import InvestmentsStep from './steps/InvestmentsStep'
import SummaryStep from './steps/SummaryStep'

const STEP_COMPONENTS = [
  ProfileStep,
  BankAccountsStep,
  CreditCardsStep,
  CashTransactionsStep,
  InvestmentsStep,
  SummaryStep
]

export default function OnboardingWizard() {
  const stepIndex = useOnboardingStore((s) => s.stepIndex)
  const goTo = useOnboardingStore((s) => s.goTo)
  const StepComponent = STEP_COMPONENTS[stepIndex]

  return (
    <div className="flex h-screen w-screen bg-content text-content-foreground">
      {/* Step rail */}
      <aside className="flex w-64 flex-col bg-sidebar px-4 py-6 text-sidebar-foreground">
        <div className="mb-8 px-2 text-lg font-semibold text-white">FinPilot Setup</div>
        <ol className="space-y-1">
          {ONBOARDING_STEPS.map((name, i) => {
            const state = i === stepIndex ? 'current' : i < stepIndex ? 'done' : 'upcoming'
            return (
              <li key={name}>
                <button
                  type="button"
                  disabled={i > stepIndex}
                  onClick={() => goTo(i)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition ${
                    state === 'current'
                      ? 'bg-primary text-white'
                      : state === 'done'
                        ? 'text-sidebar-foreground hover:bg-sidebar-accent'
                        : 'text-slate-500'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold ${
                      state === 'current'
                        ? 'bg-white text-primary'
                        : state === 'done'
                          ? 'bg-positive text-white'
                          : 'bg-sidebar-accent text-slate-400'
                    }`}
                  >
                    {state === 'done' ? '✓' : i + 1}
                  </span>
                  {name}
                </button>
              </li>
            )
          })}
        </ol>
      </aside>

      {/* Step content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-8 py-10">
          <StepComponent />
        </div>
      </main>
    </div>
  )
}
