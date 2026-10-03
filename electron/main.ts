import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { closeDatabase, getDb, isDatabaseOpen } from './db/connection'
import { registerIpcHandlers } from './ipc'
import { isDevMode, readSettings } from './services/app-settings'
import { refreshAll } from './services/market-data'
import { applyRefreshSchedule } from './services/refresh-scheduler'

const isDev = !app.isPackaged
const USER_ID = 1

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** Runs the market-data refresh if the DB is unlocked; failures are swallowed. */
function runRefresh(): void {
  if (!isDatabaseOpen()) return
  refreshAll(getDb(), USER_ID).catch(() => {})
}

/** Reads the saved schedule and (re)arms the daily refresh cron. Called at boot and after settings change. */
export function rearmRefreshSchedule(): void {
  const { refresh } = readSettings(settingsPath())
  applyRefreshSchedule(refresh.enabled, refresh.time, runRefresh)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Python sidecar scripts live at <root>/python in dev and <resources>/python when packaged. */
function sidecarScriptsDir(): string {
  return isDev ? join(app.getAppPath(), 'python') : join(process.resourcesPath, 'python')
}

app.whenReady().then(() => {
  registerIpcHandlers({
    userDataDir: app.getPath('userData'),
    sidecarPaths: { scriptsDir: sidecarScriptsDir() },
    settingsPath: settingsPath(),
    onRefreshConfigChanged: rearmRefreshSchedule,
    getDevMode: () => isDevMode(settingsPath())
  })
  createWindow()

  // Daily NAV/price refresh from the saved schedule (PRD default 19:00 IST).
  rearmRefreshSchedule()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDatabase()
})
