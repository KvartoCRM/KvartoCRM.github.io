const { app, BrowserWindow, dialog, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('node:path')

const isSafeExternalUrl = value => {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1') return false
    const parts = hostname.split('.').map(Number)
    if (parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) {
      if (parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)) return false
    }
    return true
  } catch {
    return false
  }
}

const setupAutoUpdates = () => {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', async info => {
    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Обновление KvartoCRM готово',
      message: `Версия ${info.version} уже загружена. Перезапустить приложение и установить обновление?`,
      buttons: ['Перезапустить сейчас', 'Позже'],
      defaultId: 0,
      cancelId: 1,
    })
    if (result.response === 0) autoUpdater.quitAndInstall(false, true)
  })
  autoUpdater.on('error', () => undefined)
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined)
  setTimeout(check, 8_000)
  setInterval(check, 6 * 60 * 60 * 1_000)
}

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    title: 'KvartoCRM',
    backgroundColor: '#070b14',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))

  await window.loadFile(path.join(__dirname, '..', 'dist-desktop', 'index.html'), {
    query: { desktop: '1' },
  })
}

app.whenReady().then(() => {
  void createWindow()
  setupAutoUpdates()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
