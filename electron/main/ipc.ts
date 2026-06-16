// IPC surface. Every channel validates its request and response against the shared
// zod contract, so a malformed payload can never reach the queue and the
// main↔renderer types can't silently drift. The renderer is sandboxed and reaches
// these only through the preload bridge.

import { BrowserWindow, dialog, ipcMain } from 'electron'
import {
  eventContract,
  ipcContract,
  type EventName,
  type EventPayload,
  type IpcChannel,
  type IpcRequest,
  type IpcResponse,
} from '@shared/ipc'
import type { VaultContext } from './context'
import { errorMessage, log } from './log'

const PICK_FILES = 'dialog:pickFiles'

export function registerIpc(ctx: VaultContext, getWindow: () => BrowserWindow | null): void {
  function handle<C extends IpcChannel>(
    channel: C,
    fn: (req: IpcRequest<C>) => Promise<IpcResponse<C>>,
  ): void {
    ipcMain.handle(channel, async (_e, raw: unknown) => {
      const spec = ipcContract[channel]
      try {
        const req = spec.request.parse(raw) as IpcRequest<C>
        const res = await fn(req)
        return spec.response.parse(res)
      } catch (e) {
        log.error('ipc.error', { channel, error: errorMessage(e) })
        throw e // propagates to the renderer's invoke() rejection
      }
    })
  }

  handle('ingest:addFiles', async (req) => {
    const r = await ctx.ingest.addFiles(req.paths)
    return { added: r.added, duplicates: r.duplicates }
  })

  handle('assets:list', async () => ({ assets: ctx.repo.listAssets() }))

  handle('assets:get', async (req) => ({ asset: ctx.repo.getAsset(req.id) }))

  handle('jobs:list', async (req) => ({ jobs: ctx.repo.listJobs(req.active ?? false) }))

  handle('segments:listByAsset', async (req) => ({
    segments: ctx.repo.listSegmentsByAsset(req.assetId),
  }))

  handle('thumb:get', async (req) => ({ dataUrl: await ctx.readThumbnailDataUrl(req.segmentId) }))

  handle('search:query', async (req) => ({ hits: ctx.repo.searchSegments(req.query) }))

  handle('segments:similar', async (req) => ({ hits: ctx.repo.similarSegments(req.segmentId) }))

  handle('segments:tags', async (req) => ({
    tags: ctx.repo.getSegmentTags(req.segmentId).map((t) => ({ key: t.key, value: t.value })),
  }))

  handle('assembly:teaser', async (req) => ctx.createTeaser(req.assetId))

  handle('assembly:compilation', async (req) =>
    ctx.createCompilation(req.segmentIds, req.aspect),
  )

  handle('variants:list', async () => ({ variants: ctx.repo.listVariants() }))

  handle('variant:export', async (req) => {
    const win = getWindow()
    const variant = ctx.repo.getVariant(req.variantId)
    const suggested = `${variant?.type ?? 'clip'}-${req.variantId.slice(0, 8)}.mp4`
    const res = await dialog.showSaveDialog(win ?? undefined!, {
      defaultPath: suggested,
      filters: [{ name: 'Video', extensions: ['mp4'] }],
    })
    if (res.canceled || !res.filePath) return { path: null }
    await ctx.exportVariant(req.variantId, res.filePath)
    return { path: res.filePath }
  })

  handle('review:get', async (req) => ({
    info: ctx.getReview(req.variantId),
    frameDataUrl: await ctx.readVariantFrameDataUrl(req.variantId),
  }))

  handle('review:setMasks', async (req) => {
    ctx.setReviewMasks(req.variantId, req.masks)
    return { ok: true }
  })

  handle('review:approve', async (req) => {
    await ctx.approveReview(req.variantId)
    return { ok: true }
  })

  handle('review:reject', async (req) => {
    ctx.rejectReview(req.variantId)
    return { ok: true }
  })

  // Native file picker — returns chosen paths (empty if cancelled).
  ipcMain.handle(PICK_FILES, async () => {
    const win = getWindow()
    const res = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Video', extensions: ['mov', 'mp4', 'm4v', 'mkv', 'avi', 'webm'] }],
    })
    return res.canceled ? [] : res.filePaths
  })
}

/** Push current asset + job state to the renderer (called on every change). */
export function broadcastState(getWindow: () => BrowserWindow | null, ctx: VaultContext): void {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  send(win, 'assets:changed', { assets: ctx.repo.listAssets() })
  send(win, 'jobs:changed', { jobs: ctx.repo.listJobs(false) })
  send(win, 'variants:changed', { variants: ctx.repo.listVariants() })
}

function send<E extends EventName>(win: BrowserWindow, event: E, payload: EventPayload<E>): void {
  const valid = eventContract[event].parse(payload)
  win.webContents.send(event, valid)
}
