import { useEffect } from 'react'
import { useAppStore } from './stores/appStore'
import Splash from './pages/Splash'
import OnboardingWizard from './pages/onboarding/OnboardingWizard'
import Dashboard from './pages/Dashboard'

function App() {
  const screen = useAppStore((s) => s.screen)
  const init = useAppStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  switch (screen) {
    case 'loading':
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-content text-slate-400">
          Loading…
        </div>
      )
    case 'password':
      return <Splash />
    case 'onboarding':
      return <OnboardingWizard />
    case 'dashboard':
      return <Dashboard />
  }
}

export default App
