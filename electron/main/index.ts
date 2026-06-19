// Electron entry. Builds the vault context (master key from the OS keychain), opens
// a secure window (contextIsolation on, nodeIntegration off), and wires IPC. All
// vault logic lives in the platform-agnostic core modules; this file is the only
// place that touches Electron app/window APIs.

import { join } from 'node:path'
import { readFileSync, createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { app, BrowserWindow, protocol } from 'electron'
import { createVaultContext, type VaultContext } from './context'
import { loadOrCreateMasterKey } from './masterkey'
import { broadcastState, registerIpc } from './ipc'
import { runSelfTest } from './selftest'
import { runUiTest } from './uitest'
import { runCli } from './cli'
import { errorMessage, log, routeLogsToStderr } from './log'

const IS_SELFTEST = process.argv.includes('--selftest')
const IS_UITEST = process.argv.includes('--uitest')
const CLI_INDEX = process.argv.indexOf('--cli')
const IS_CLI = CLI_INDEX !== -1

let mainWindow: BrowserWindow | null = null
let ctx: VaultContext | null = null

const getWindow = (): BrowserWindow | null => mainWindow

// The editor streams decrypted Masters over a private scheme. Privileged so it can
// be a <video> source under our CSP and honour Range requests (seeking). Must be
// declared before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vaultmedia',
    privileges: { secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true },
  },
])

/** Serve a decrypted Master with HTTP Range support so the editor's <video> can seek. */
function registerMediaProtocol(c: VaultContext): void {
  protocol.handle('vaultmedia', async (request) => {
    try {
      const masterId = new URL(request.url).hostname
      const file = await c.materializeMaster(masterId)
      if (!file) return new Response('not found', { status: 404 })
      const { size } = await stat(file)
      const range = request.headers.get('Range')
      const headersBase = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' }
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        const start = m && m[1] ? parseInt(m[1], 10) : 0
        const end = m && m[2] ? parseInt(m[2], 10) : size - 1
        const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
        return new Response(body, {
          status: 206,
          headers: {
            ...headersBase,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
          },
        })
      }
      const body = Readable.toWeb(createReadStream(file)) as ReadableStream
      return new Response(body, { status: 200, headers: { ...headersBase, 'Content-Length': String(size) } })
    } catch (e) {
      return new Response(errorMessage(e), { status: 500 })
    }
  })
}

function loadSchemaSql(): string {
  // db/** is bundled inside app.asar (build.files). Electron's fs reads from the
  // asar, so app.getAppPath() works in both dev and the packaged app.
  return readFileSync(join(app.getAppPath(), 'db', 'schema.sql'), 'utf8')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#0b0c10',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // contextIsolation is the real boundary; keep ESM-free preload simple
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// In CLI mode, keep the app from showing in the dock and route logs to stderr so
// stdout is pure JSON. Must be set before whenReady.
if (IS_CLI) {
  routeLogsToStderr()
  app.dock?.hide()
}

app.whenReady().then(async () => {
  // Headless CLI for agents/users: run one command against the shared vault, exit.
  if (IS_CLI) {
    const code = await runCli(process.argv.slice(CLI_INDEX + 1), {
      userData: app.getPath('userData'),
      schemaSql: loadSchemaSql(),
    })
    app.exit(code)
    return
  }

  // Headless self-test: verify the Electron runtime + native modules + pipeline,
  // then exit. Needs no window/display — safe for CI and sandboxes.
  if (IS_SELFTEST) {
    const ok = await runSelfTest(loadSchemaSql())
    app.exit(ok ? 0 : 1)
    return
  }

  if (IS_UITEST) {
    process.env.VAULTOP_NO_ML = '1' // walkthrough stays offline/fast
    const ok = await runUiTest(loadSchemaSql(), app.getPath('temp'))
    app.exit(ok ? 0 : 1)
    return
  }

  // Verify the bundled ML runtime (onnxruntime/transformers/sharp) actually loads
  // + runs inside the packaged app. Throws (exit 1) if it can't — used pre-release.
  if (process.argv.includes('--mltest')) {
    try {
      const { spawnSync } = await import('node:child_process')
      const { FFMPEG_BIN } = await import('./ffmpeg')
      const { ObjectDetector } = await import('./detector')
      const frame = join(app.getPath('temp'), `vop-mltest-${Date.now()}.jpg`)
      spawnSync(FFMPEG_BIN, ['-f', 'lavfi', '-i', 'testsrc=size=320x240:duration=1', '-frames:v', '1', '-y', frame])
      const det = new ObjectDetector(join(app.getPath('temp'), 'vop-mltest-cache'))
      const regions = await det.detectImage(frame)
      // eslint-disable-next-line no-console
      console.log(`✅ MLTEST PASS — onnxruntime + transformers ran in the packaged app (regions: ${regions.length})`)
      app.exit(0)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('❌ MLTEST FAIL:', e)
      app.exit(1)
    }
    return
  }

  try {
    const masterKey = loadOrCreateMasterKey(app.getPath('userData'))
    const baseDir = join(app.getPath('userData'), 'vault')
    ctx = createVaultContext({
      baseDir,
      masterKey,
      schemaSql: loadSchemaSql(),
      onChanged: () => broadcastState(getWindow, ctx!),
    })
    registerIpc(ctx, getWindow)
    registerMediaProtocol(ctx)
    createWindow()
    // Push initial state once the renderer is up.
    app.on('browser-window-created', () => setTimeout(() => broadcastState(getWindow, ctx!), 300))
    log.info('app.ready', { baseDir })
  } catch (e) {
    log.error('app.fatal', { error: errorMessage(e) })
    throw e
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    ctx?.close()
    app.quit()
  }
})

app.on('before-quit', () => ctx?.close())
