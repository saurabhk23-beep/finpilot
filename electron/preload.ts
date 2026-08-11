import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: (channel: string, payload: Record<string, unknown>) => ipcRenderer.invoke(channel, payload)
}

contextBridge.exposeInMainWorld('api', api)

export type FinPilotApi = typeof api
