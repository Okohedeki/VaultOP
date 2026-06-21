// Recipe engine: turns an ordered set of segments into a single rendered Variant.
//
// Compilation and teaser are the same pipeline with different segment selection:
//   • decrypt each referenced master once (cached), reframe+cut each segment to a
//     normalized TS clip filling the target canvas, then losslessly concat.
//   • teasers cap total duration, trimming the final clip.
// The result is re-encrypted into the vault. Plaintext masters live only in tmp
// and are wiped afterward.

import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import type { BlobStore } from './blobstore'
import type { VaultPaths } from './paths'
import type { Repo } from './repo'
import type { JobContext, JobHandler } from './queue'
import type { Aspect } from '@shared/domain'
import {
  burnCaptions,
  concatClips,
  extractThumbnail,
  probeHasAudio,
  renderGif,
  renderNormalizedClip,
  type Canvas,
} from './ffmpeg'
import { buildAssFromOverlays, buildSrtFromEdl, type CaptionClip, type TextOverlayItem } from './captions'
import type { Detector } from './detector'
import { log } from './log'

export const RENDER_VERSION = 'render-v1'
const FPS = 30

export const CANVASES: Record<Aspect, Canvas> = {
  vertical: { width: 1080, height: 1920, fps: FPS },
  square: { width: 1080, height: 1080, fps: FPS },
  widescreen: { width: 1920, height: 1080, fps: FPS },
}

/** Cap an ordered segment list to a max total duration, trimming the last one. */
export function capToDuration<T extends { startMs: number; endMs: number }>(
  segments: T[],
  maxDurationMs: number | undefined,
): T[] {
  if (!maxDurationMs) return segments
  const out: T[] = []
  let total = 0
  for (const s of segments) {
    if (total >= maxDurationMs) break
    const remaining = maxDurationMs - total
    const len = s.endMs - s.startMs
    if (len <= remaining) {
      out.push(s)
      total += len
    } else {
      out.push({ ...s, endMs: s.startMs + remaining })
      total += remaining
      break
    }
  }
  return out
}

/** Cap EDL items to a max OUTPUT duration, trimming the final clip's source window
 *  so its sped/slowed rendered length exactly fills the remaining budget. */
export function capItemsToOutput<T extends { startMs: number; endMs: number; speed: number }>(
  items: T[],
  maxOutMs: number | undefined,
): T[] {
  if (!maxOutMs) return items
  const out: T[] = []
  let total = 0
  for (const it of items) {
    if (total >= maxOutMs) break
    const speed = it.speed > 0 ? it.speed : 1
    const outLen = (it.endMs - it.startMs) / speed
    const remaining = maxOutMs - total
    if (outLen <= remaining) {
      out.push(it)
      total += outLen
    } else {
      // Keep only the source portion whose rendered length fits the budget.
      out.push({ ...it, endMs: Math.round(it.startMs + remaining * speed) })
      total += remaining
      break
    }
  }
  return out
}

export function makeRenderHandler(deps: {
  repo: Repo
  blobs: BlobStore
  paths: VaultPaths
  detector: Detector
}): JobHandler {
  const { repo, blobs, paths, detector } = deps

  return async function render({ job, setProgress }: JobContext): Promise<void> {
    const variantId = job.targetId
    const variant = repo.getVariant(variantId)
    if (!variant) throw new Error(`variant ${variantId} not found`)

    repo.setVariantState(variantId, 'rendering')

    const recipe = repo.getVariantRecipe(variantId)
    const canvas = CANVASES[variant.aspect]
    const maxDurationMs =
      typeof recipe.maxDurationMs === 'number'
        ? recipe.maxDurationMs
        : variant.type === 'teaser'
          ? 30_000
          : undefined
    const colorNormalize = recipe.colorNormalize === true
    const asGif = recipe.format === 'gif'

    // A Cut renders from an EDL (ordered clips + per-clip speed); legacy teaser/
    // compilation variants render from their selected segment ids. Both reduce to
    // the same ordered list of normalized clips that get concatenated.
    type Item = { masterHash: string; startMs: number; endMs: number; speed: number }
    let items: Item[]
    if (recipe.kind === 'edl') {
      const edl = recipe.edl as { clips?: Array<Record<string, unknown>> } | undefined
      const clips = (edl?.clips ?? []) as Array<{
        masterId: string
        startMs: number
        endMs: number
        speed?: number
      }>
      // A Promo caps the Cut's EDL to the platform's max length (on OUTPUT time,
      // so a sped-up clip counts by its rendered duration).
      items = capItemsToOutput(repo.resolveEdlForRender(clips), maxDurationMs)
    } else {
      items = capToDuration(
        repo.resolveSegmentsForRender(variant.sourceSegmentIds),
        maxDurationMs,
      ).map((s) => ({ masterHash: s.masterHash, startMs: s.startMs, endMs: s.endMs, speed: 1 }))
    }
    if (items.length === 0) throw new Error('no clips resolved for render')

    const decrypted = new Map<string, string>() // masterHash → tmp plaintext path
    const clipPaths: string[] = []
    const listFile = join(paths.tmpDir, `${randomUUID()}.concat.txt`)
    const outFile = join(paths.tmpDir, `${randomUUID()}.out.mp4`)
    let gifFile: string | null = null
    let srtFile: string | null = null
    let captionedFile: string | null = null
    let assFile: string | null = null
    let overlaidFile: string | null = null

    try {
      // Decrypt each unique master once.
      for (const seg of items) {
        if (!decrypted.has(seg.masterHash)) {
          const p = join(paths.tmpDir, `${randomUUID()}.master.mp4`)
          await blobs.getToFile(seg.masterHash, p)
          decrypted.set(seg.masterHash, p)
        }
      }
      setProgress(0.15)

      // Render each clip to a normalized TS clip (applying per-clip speed).
      let totalMs = 0
      for (let i = 0; i < items.length; i++) {
        const seg = items[i]!
        const master = decrypted.get(seg.masterHash)!
        const clip = join(paths.tmpDir, `${randomUUID()}.clip.ts`)
        await renderNormalizedClip({
          master,
          startMs: seg.startMs,
          endMs: seg.endMs,
          canvas,
          hasAudio: await probeHasAudio(master),
          output: clip,
          colorNormalize,
          speed: seg.speed,
        })
        clipPaths.push(clip)
        totalMs += Math.round((seg.endMs - seg.startMs) / seg.speed)
        setProgress(0.15 + ((i + 1) / items.length) * 0.65)
      }

      // Concat (lossless), optionally burn captions, optionally GIF, then encrypt.
      await writeFile(listFile, clipPaths.map((c) => `file '${c}'`).join('\n'), 'utf8')
      await concatClips(listFile, outFile)
      setProgress(0.85)

      let finalFile = outFile

      // Auto-captions (E3): map each EDL clip's transcript onto the output timeline.
      if (recipe.kind === 'edl' && (recipe.edl as { captions?: boolean })?.captions === true) {
        const edlClips = ((recipe.edl as { clips?: CaptionClip[] }).clips ?? []).map((c) => ({
          masterId: c.masterId,
          startMs: c.startMs,
          endMs: c.endMs,
          speed: c.speed > 0 ? c.speed : 1,
        }))
        const byMaster = new Map<string, ReturnType<Repo['getTranscriptChunks']>>()
        for (const mid of new Set(edlClips.map((c) => c.masterId))) {
          byMaster.set(mid, repo.getTranscriptChunks(mid))
        }
        const srt = buildSrtFromEdl(edlClips, byMaster)
        if (srt.trim()) {
          srtFile = join(paths.tmpDir, `${randomUUID()}.srt`)
          captionedFile = join(paths.tmpDir, `${randomUUID()}.cap.mp4`)
          await writeFile(srtFile, srt, 'utf8')
          await burnCaptions(finalFile, srtFile, captionedFile)
          finalFile = captionedFile
          log.info('render.captioned', { variantId })
        } else {
          log.info('render.captions_empty', { variantId })
        }
      }
      // Manual text overlays (titles) — burned via the same libass path as captions.
      if (recipe.kind === 'edl') {
        const overlays = ((recipe.edl as { overlays?: TextOverlayItem[] }).overlays ?? []).filter(
          (o) => o.endMs > o.startMs && o.text?.trim(),
        )
        if (overlays.length) {
          const ass = buildAssFromOverlays(overlays, canvas)
          if (ass.trim()) {
            assFile = join(paths.tmpDir, `${randomUUID()}.ass`)
            overlaidFile = join(paths.tmpDir, `${randomUUID()}.ov.mp4`)
            await writeFile(assFile, ass, 'utf8')
            await burnCaptions(finalFile, assFile, overlaidFile)
            finalFile = overlaidFile
            log.info('render.overlaid', { variantId, overlays: overlays.length })
          }
        }
      }
      setProgress(0.9)

      if (asGif) {
        const gif = join(paths.tmpDir, `${randomUUID()}.gif`)
        await renderGif(finalFile, gif)
        finalFile = gif
        gifFile = gif
      }
      setProgress(0.94)

      const blob = await blobs.putFile(finalFile)
      repo.setVariantResult(variantId, blob.uri, totalMs)

      // Platform-bound cut → auto-suggest blur masks (people/faces) for the human
      // to verify and refine. Best-effort; the gate is mandatory regardless.
      if (variant.requiresReview && detector.available) {
        try {
          const frame = join(paths.tmpDir, `${randomUUID()}.detect.jpg`)
          await extractThumbnail(outFile, Math.max(100, Math.floor(totalMs / 2)), frame)
          const regions = await detector.detectImage(frame)
          await rm(frame, { force: true })
          if (regions.length) {
            repo.setReviewMasks(
              variantId,
              regions.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, cls: r.cls })),
            )
            log.info('render.prefilled_masks', { variantId, regions: regions.length })
          }
        } catch (e) {
          log.warn('render.detect_skipped', { variantId, error: String(e) })
        }
      }

      setProgress(1)
      log.info('render.ready', { variantId, clips: clipPaths.length, durationMs: totalMs, asGif })
    } catch (e) {
      repo.setVariantState(variantId, 'failed', e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      await Promise.all([
        ...[...decrypted.values()].map((p) => rm(p, { force: true })),
        ...clipPaths.map((p) => rm(p, { force: true })),
        rm(listFile, { force: true }),
        rm(outFile, { force: true }),
        gifFile ? rm(gifFile, { force: true }) : Promise.resolve(),
        srtFile ? rm(srtFile, { force: true }) : Promise.resolve(),
        captionedFile ? rm(captionedFile, { force: true }) : Promise.resolve(),
        assFile ? rm(assFile, { force: true }) : Promise.resolve(),
        overlaidFile ? rm(overlaidFile, { force: true }) : Promise.resolve(),
      ])
    }
  }
}
