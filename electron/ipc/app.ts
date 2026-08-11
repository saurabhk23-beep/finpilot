import { ipcMain, app } from 'electron'

export function registerAppHandlers(): void {
  ipcMain.handle('app:ping', async (_event, { userId }: { userId: number }) => {
    return { ok: true, userId, version: app.getVersion() }
  })
}
