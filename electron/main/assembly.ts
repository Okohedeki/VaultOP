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
import { concatClips, probeHasAudio, renderGif, renderNormalizedClip, type Canvas } from './ffmpeg'
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

export function makeRenderHandler(deps: {
  repo: Repo
  blobs: BlobStore
  paths: VaultPaths
}): JobHandler {
  const { repo, blobs, paths } = deps

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

    const resolved = capToDuration(
      repo.resolveSegmentsForRender(variant.sourceSegmentIds),
      maxDurationMs,
    )
    if (resolved.length === 0) throw new Error('no segments resolved for render')

    const decrypted = new Map<string, string>() // masterHash → tmp plaintext path
    const clipPaths: string[] = []
    const listFile = join(paths.tmpDir, `${randomUUID()}.concat.txt`)
    const outFile = join(paths.tmpDir, `${randomUUID()}.out.mp4`)
    let gifFile: string | null = null

    try {
      // Decrypt each unique master once.
      for (const seg of resolved) {
        if (!decrypted.has(seg.masterHash)) {
          const p = join(paths.tmpDir, `${randomUUID()}.master.mp4`)
          await blobs.getToFile(seg.masterHash, p)
          decrypted.set(seg.masterHash, p)
        }
      }
      setProgress(0.15)

      // Render each segment to a normalized TS clip.
      let totalMs = 0
      for (let i = 0; i < resolved.length; i++) {
        const seg = resolved[i]!
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
        })
        clipPaths.push(clip)
        totalMs += seg.endMs - seg.startMs
        setProgress(0.15 + ((i + 1) / resolved.length) * 0.65)
      }

      // Concat (lossless), optionally convert to GIF, then encrypt into the vault.
      await writeFile(listFile, clipPaths.map((c) => `file '${c}'`).join('\n'), 'utf8')
      await concatClips(listFile, outFile)
      setProgress(0.88)

      let finalFile = outFile
      if (asGif) {
        finalFile = join(paths.tmpDir, `${randomUUID()}.gif`)
        await renderGif(outFile, finalFile)
        gifFile = finalFile
      }
      setProgress(0.94)

      const blob = await blobs.putFile(finalFile)
      repo.setVariantResult(variantId, blob.uri, totalMs)
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
      ])
    }
  }
}
