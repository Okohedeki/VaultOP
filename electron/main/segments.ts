// Scene-split worker: master → Segments (+ encrypted thumbnails).
//
// Decrypts the master once into tmp, runs native ffmpeg scene detection, turns the
// cut points into Segment rows (merging anything below a minimum length), then
// extracts and encrypts a keyframe thumbnail per segment. Wipes all plaintext.
// On completion the asset finally becomes `ready` — the library is now sliceable.

import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import type { BlobStore } from './blobstore'
import type { VaultPaths } from './paths'
import type { Repo } from './repo'
import type { JobContext, JobHandler } from './queue'
import { detectSceneCuts, extractThumbnail } from './ffmpeg'
import { embeddingToBuffer, type Analyzer } from './analyzer'
import { stableHash } from './hash'
import { TRANSCRIBE_VERSION } from './transcribe'
import { TAG_VERSION } from './tagger'
import { log } from './log'

export const SCENE_SPLIT_VERSION = 'scene-split-v1'
const MIN_SEGMENT_MS = 1200 // merge slices shorter than this into the previous one

/** Turn ordered cut points + total duration into [start,end] segment ranges. */
export function buildSegmentRanges(
  cuts: number[],
  durationMs: number,
  minMs = MIN_SEGMENT_MS,
): Array<{ startMs: number; endMs: number }> {
  const sorted = [...new Set(cuts)].filter((c) => c > 0 && c < durationMs).sort((a, b) => a - b)
  const boundaries = [0, ...sorted, durationMs]
  const ranges: Array<{ startMs: number; endMs: number }> = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startMs = boundaries[i]!
    const endMs = boundaries[i + 1]!
    if (endMs - startMs < minMs && ranges.length > 0) {
      ranges[ranges.length - 1]!.endMs = endMs // merge tiny slice into previous
    } else {
      ranges.push({ startMs, endMs })
    }
  }
  return ranges.length ? ranges : [{ startMs: 0, endMs: durationMs }]
}

export function makeSceneSplitHandler(deps: {
  repo: Repo
  blobs: BlobStore
  paths: VaultPaths
  analyzer: Analyzer
}): JobHandler {
  const { repo, blobs, paths, analyzer } = deps

  return async function sceneSplit({ job, setProgress }: JobContext): Promise<void> {
    const assetId = job.targetId
    const master = repo.getMasterByAsset(assetId)
    if (!master) throw new Error(`master for asset ${assetId} not found`)

    const masterHash = master.storageUri.replace('blobs/', '')
    const plaintext = join(paths.tmpDir, `${randomUUID()}.master.mp4`)
    const thumbsToWipe: string[] = []

    try {
      await blobs.getToFile(masterHash, plaintext)
      setProgress(0.1)

      const cuts = await detectSceneCuts(plaintext)
      const ranges = buildSegmentRanges(cuts, master.durationMs)
      setProgress(0.25)
      log.info('scene_split.ranges', { assetId, scenes: ranges.length })

      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i]!
        const segId = repo.createSegment({
          masterId: master.id,
          startMs: r.startMs,
          endMs: r.endMs,
        })

        // Thumbnail at the segment midpoint, encrypted into the vault.
        const midMs = Math.floor((r.startMs + r.endMs) / 2)
        const thumbPath = join(paths.tmpDir, `${randomUUID()}.jpg`)
        thumbsToWipe.push(thumbPath)
        await extractThumbnail(plaintext, midMs, thumbPath)
        const blob = await blobs.putFile(thumbPath)
        repo.setSegmentThumbnail(segId, blob.uri)

        // Analyze the keyframe → embedding (visual similarity) + tags (searchable).
        try {
          const a = await analyzer.analyze({
            thumbnailPath: thumbPath,
            durationMs: r.endMs - r.startMs,
          })
          repo.setSegmentEmbedding(segId, embeddingToBuffer(a.embedding))
          for (const t of a.tags) {
            repo.addTag({ segmentId: segId, key: t.key, value: t.value, confidence: t.confidence })
          }
        } catch (e) {
          // Analysis is best-effort — a segment without tags is still browsable.
          log.warn('scene_split.analyze_failed', { segId, error: String(e) })
        }

        setProgress(0.25 + ((i + 1) / ranges.length) * 0.7)
      }

      repo.setAssetStatus(assetId, 'ready', null)
      setProgress(1)
      log.info('scene_split.ready', { assetId, segments: ranges.length })

      // Kick off speech transcription on the GPU lane (best-effort; downloads the
      // whisper model on first use). The library is already searchable/sliceable;
      // transcripts enrich search + enable captions when they land.
      repo.enqueueJob({
        type: 'transcribe',
        targetType: 'asset',
        targetId: assetId,
        workerClass: 'gpu',
        inputHash: stableHash(['transcribe', TRANSCRIBE_VERSION, assetId]),
      })
      // Semantic auto-tags (setting, who's-in-frame) via CLIP, on first-use model.
      repo.enqueueJob({
        type: 'tag',
        targetType: 'asset',
        targetId: assetId,
        workerClass: 'gpu',
        inputHash: stableHash(['tag', TAG_VERSION, assetId]),
      })
    } catch (e) {
      repo.setAssetStatus(assetId, 'failed', e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      await rm(plaintext, { force: true })
      await Promise.all(thumbsToWipe.map((p) => rm(p, { force: true })))
    }
  }
}
