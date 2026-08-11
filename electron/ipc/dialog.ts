import { dialog, ipcMain } from 'electron'
import { statSync } from 'fs'
import { basename } from 'path'

export interface PickedFile {
  path: string
  name: string
  size: number
}

/**
 * Native file-open dialog. Returns selected files' path/name/size (not contents) —
 * onboarding stores these references and Phase D parses them later.
 */
export function registerDialogHandlers(): void {
  ipcMain.handle(
    'dialog:openFiles',
    async (_event, params: { accept?: string[]; multiple?: boolean }): Promise<PickedFile[]> => {
      const filters =
        params?.accept && params.accept.length > 0
          ? [{ name: 'Statements', extensions: params.accept }]
          : undefined

      const result = await dialog.showOpenDialog({
        properties: params?.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters
      })

      if (result.canceled) return []
      return result.filePaths.map((p) => ({
        path: p,
        name: basename(p),
        size: statSync(p).size
      }))
    }
  )
}
