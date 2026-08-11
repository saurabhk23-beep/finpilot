/// <reference types="vite/client" />

import type { FinPilotApi } from '../electron/preload'

declare global {
  interface Window {
    api: FinPilotApi
  }
}
