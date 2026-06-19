// GUI integration test: launches a real BrowserWindow, loads the actual renderer,
// and drives the whole product through the UI + IPC — ingest a clip, watch it
// process to "ready", open the segment grid, make a teaser, and confirm the review
// gate appears. Screenshots are captured at each step. This is the "every feature
// actually works in the window" proof. Invoked via `VaultOP --uitest`.

import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createVaultContext } from './context'
import { registerIpc, broadcastState } from './ipc'
import { FFMPEG_BIN } from './ffmpeg'
import { log } from './log'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function pollUntil(fn: () => boolean, timeoutMs: number, stepMs = 400): Promise<boolean> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (fn()) return true
    await wait(stepMs)
  }
  return fn()
}

export async function runUiTest(schemaSql: string, shotDir: string): Promise<boolean> {
  const work = mkdtempSync(join(tmpdir(), 'vaultop-uitest-'))
  let win: BrowserWindow | null = null
  let ctx: ReturnType<typeof createVaultContext> | null = null
  const checks: Record<string, unknown> = {}

  const shot = async (name: string): Promise<void> => {
    if (!win) return
    const png = await win.webContents.capturePage()
    writeFileSync(join(shotDir, `vaultop-ui-${name}.png`), png.toPNG())
  }
  const js = <T = unknown>(code: string): Promise<T> => win!.webContents.executeJavaScript(code)

  try {
    win = new BrowserWindow({
      width: 1280,
      height: 860,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    const getWindow = (): BrowserWindow | null => win
    ctx = createVaultContext({
      baseDir: join(work, 'vault'),
      masterKey: randomBytes(32),
      schemaSql,
      onChanged: () => broadcastState(getWindow, ctx!),
    })
    registerIpc(ctx, getWindow)

    await win.loadFile(join(__dirname, '../renderer/index.html'))
    await wait(1200)

    // ── 1. App opened & rendered ────────────────────────────────────────────
    checks.mounted = (await js<number>(`document.getElementById('root')?.children.length || 0`)) > 0
    checks.bridge = (await js<string>(`typeof window.vaultop`)) === 'object'
    checks.header = /VAULT/i.test(await js<string>(`document.querySelector('.app__brand h1')?.textContent||''`))
    checks.dropzone = await js<boolean>(`!!document.querySelector('.dropzone')`)
    checks.ipc = await js<boolean>(
      `window.vaultop.invoke('assets:list',{}).then(r=>Array.isArray(r.assets)).catch(()=>false)`,
    )
    await shot('1-open')

    // ── 2. Ingest a clip → processes to ready, shows in the vault ────────────
    const sample = join(work, 'sample.mp4')
    spawnSync(
      FFMPEG_BIN,
      ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-shortest', '-pix_fmt', 'yuv420p', sample],
      { encoding: 'utf8' },
    )
    await ctx.ingest.addFiles([sample])
    const assetId = ctx.repo.listAssets()[0]?.id
    checks.ingested = await pollUntil(() => ctx!.repo.getAsset(assetId!)?.status === 'ready', 60_000)
    await wait(700) // let the renderer receive the broadcast
    checks.assetVisible = (await js<number>(`document.querySelectorAll('.clip').length`)) >= 1
    await shot('2-library')

    // ── 3. Open the asset → segment grid renders ────────────────────────────
    await js(`document.querySelector('.clip--open')?.click(); true`)
    await wait(1000) // segment grid loads thumbnails via IPC
    checks.segmentGrid = (await js<number>(`document.querySelectorAll('.seg__tile').length`)) >= 1
    await shot('3-segments')

    // ── 3b. Open the editor → Tagger renders, Sections seeded from Scenes ─────
    await js(
      `[...document.querySelectorAll('.seg__actions button')].find(b=>/edit/i.test(b.textContent))?.click(); true`,
    )
    await wait(1200)
    checks.editorOpen = await js<boolean>(`!!document.querySelector('.ed')`)
    checks.timelineSeeded = (await js<number>(`document.querySelectorAll('.tl__block').length`)) >= 1
    checks.playerPresent = await js<boolean>(`!!document.querySelector('.ed__video')`)
    await shot('3b-editor')

    // Tag a Section through the real IPC path, then read it back by tag.
    checks.sectionTagged = await js<boolean>(
      `(async()=>{` +
        `const m=(await window.vaultop.invoke('master:getByAsset',{assetId:${JSON.stringify(assetId)}})).master;` +
        `const secs=(await window.vaultop.invoke('sections:listByMaster',{masterId:m.id})).sections;` +
        `await window.vaultop.invoke('sections:tag',{sectionId:secs[0].id,value:'reveal'});` +
        `const hits=(await window.vaultop.invoke('sections:byTag',{value:'reveal',masterId:m.id})).sections;` +
        `return hits.length===1 && hits[0].tags.some(t=>t.value==='reveal');` +
        `})()`,
    )
    // ── 3c. Builder: assemble a Cut from a Section and render it ─────────────
    await js(
      `[...document.querySelectorAll('.ed__head-actions button')].find(b=>/build cut/i.test(b.textContent))?.click(); true`,
    )
    await wait(900)
    checks.builderOpen = await js<boolean>(`!!document.querySelector('.bld')`)
    await js(`document.querySelector('.bld__pool-list .bld__add')?.click(); true`)
    await wait(300)
    checks.cutClipAdded = (await js<number>(`document.querySelectorAll('.bld__clip').length`)) >= 1
    await js(`document.querySelector('.bld__cc')?.click(); true`) // captions on (empty w/o ML → no-op burn)
    checks.captionToggle = await js<boolean>(`!!document.querySelector('.bld__cc.is-on')`)
    await shot('3c-builder')
    await js(
      `[...document.querySelectorAll('.ed__head-actions button')].find(b=>/render cut/i.test(b.textContent))?.click(); true`,
    )
    checks.cutRendered = await pollUntil(
      () => ctx!.repo.listVariants().some((v) => v.type === 'cut' && v.renderState === 'ready'),
      60_000,
    )
    await wait(600) // onRendered returns to the segment grid

    // ── 4. Cut → Promos: pick a platform → gated promo renders ───────────────
    await wait(500) // let the Cut deliverable broadcast into the side panel
    await js(
      `[...document.querySelectorAll('.app__side button')].find(b=>/make promos/i.test(b.textContent))?.click(); true`,
    )
    await wait(300)
    checks.promoPicker = await js<boolean>(`!!document.querySelector('.promo-pick')`)
    await js(
      `[...document.querySelectorAll('.promo-pick button')].find(b=>/create .*promo/i.test(b.textContent))?.click(); true`,
    )
    checks.promoRendered = await pollUntil(
      () => ctx!.repo.listVariants().some((v) => v.type === 'promo' && v.renderState === 'ready'),
      60_000,
    )
    await wait(700)
    checks.gateVisible = await js<boolean>(
      `[...document.querySelectorAll('button')].some(b=>/review to unlock/i.test(b.textContent))`,
    )
    await shot('4-promos-gate')

    // ── 5. Review the promo → modal opens, approve → export unlocks ──────────
    await js(
      `[...document.querySelectorAll('button')].find(b=>/review to unlock/i.test(b.textContent))?.click(); true`,
    )
    await wait(1400) // modal mounts + review frame decrypts
    checks.reviewModal = await js<boolean>(`!!document.querySelector('.modal-backdrop')`)
    await shot('5-review')
    await js(
      `[...document.querySelectorAll('.modal button')].find(b=>/approve/i.test(b.textContent))?.click(); true`,
    )
    checks.approved = await pollUntil(() => {
      const promo = ctx!.repo.listVariants().find((v) => v.type === 'promo')
      return promo ? ctx!.repo.getVariant(promo.id)?.reviewState === 'approved' : false
    }, 40_000)
    await wait(900) // let the unlocked state broadcast to the UI
    checks.exportUnlocked = await js<boolean>(
      `[...document.querySelectorAll('.app__side button')].some(b=>/export/i.test(b.textContent)) ` +
        `|| [...document.querySelectorAll('.vop-badge')].some(b=>/safe to post/i.test(b.textContent))`,
    )
    await shot('6-approved')

    const ok = Object.values(checks).every((v) => v === true)
    log.info('uitest.result', { ...checks, shotDir })
    // eslint-disable-next-line no-console
    console.log(
      ok ? '✅ VaultOP UI walkthrough PASSED' : '❌ VaultOP UI walkthrough FAILED',
      JSON.stringify(checks),
    )
    return ok
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('❌ VaultOP UI test ERROR:', e)
    return false
  } finally {
    ctx?.close()
    win?.destroy()
  }
}
