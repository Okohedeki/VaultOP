// Wires the vault together from a base directory + master key. Electron's index.ts
// and the headless smoke script both build a context this way — the only
// difference is where the master key and schema come from.

import { openDb, type Db } from './db'
import { resolveVaultPaths, type VaultPaths } from './paths'
import { Repo } from './repo'
import { VaultCrypto } from './crypto'
import { BlobStore } from './blobstore'
import { Queue } from './queue'
import { Ingest } from './ingest'
import { makeTranscodeHandler } from './transcode'
import { makeSceneSplitHandler } from './segments'
import { makeRenderHandler, RENDER_VERSION, CANVASES } from './assembly'
import { NativeAnalyzer } from './analyzer'
import { NoopDetector } from './detector'
import { makeTranscribeHandler, WhisperTranscriber } from './transcribe'
import { blurRegions, extractThumbnail, watermarkClip, type BlurRegion } from './ffmpeg'
import { stableHash } from './hash'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import type { Aspect, MaskRegion, ReviewInfo, VariantType } from '@shared/domain'

export interface VaultContext {
  paths: VaultPaths
  repo: Repo
  blobs: BlobStore
  queue: Queue
  ingest: Ingest
  /** Decrypt a segment's thumbnail and return it as a data URL (null if none). */
  readThumbnailDataUrl(segmentId: string): Promise<string | null>
  /** Build a vertical teaser from an asset's segments (capped to 30s by the engine). */
  createTeaser(assetId: string): { variantId: string }
  /** Stitch arbitrary segments (cross-library) into a compilation. */
  createCompilation(segmentIds: string[], aspect: Aspect): { variantId: string }
  /** One master → the full deliverable set: vertical + square teasers, preview GIF, paid cut. */
  createFanout(assetId: string): { variantIds: string[] }
  /** Export an approved variant with a per-fan forensic watermark burned in. */
  exportWatermarked(variantId: string, fanLabel: string, destPath: string): Promise<void>
  /** Decrypt a finished variant to a destination path for the creator to post. */
  exportVariant(variantId: string, destPath: string): Promise<void>
  /** Review-gate operations. */
  getReview(variantId: string): ReviewInfo | null
  setReviewMasks(variantId: string, masks: MaskRegion[]): void
  approveReview(variantId: string): Promise<void>
  rejectReview(variantId: string): void
  /** A representative frame from a variant, for the review canvas. */
  readVariantFrameDataUrl(variantId: string): Promise<string | null>
  close(): void
}

export interface CreateContextOpts {
  baseDir: string
  masterKey: Buffer
  schemaSql: string
  onChanged?: () => void
  autostart?: boolean
}

export function createVaultContext(opts: CreateContextOpts): VaultContext {
  const notify = opts.onChanged ?? ((): void => {})
  const paths = resolveVaultPaths(opts.baseDir)
  const db: Db = openDb(paths.dbFile, opts.schemaSql)
  const repo = new Repo(db)
  const crypto = new VaultCrypto(opts.masterKey)
  const blobs = new BlobStore(crypto, paths)
  const queue = new Queue(repo, { onChanged: opts.onChanged })

  const analyzer = new NativeAnalyzer()
  const detector = new NoopDetector()
  queue.register('transcode', makeTranscodeHandler({ repo, blobs, paths }))
  queue.register('scene_split', makeSceneSplitHandler({ repo, blobs, paths, analyzer }))
  queue.register('render', makeRenderHandler({ repo, blobs, paths }))
  const transcriber = new WhisperTranscriber(join(paths.base, 'models', 'transformers'))
  queue.register('transcribe', makeTranscribeHandler({ repo, blobs, paths, transcriber }))

  function enqueueRender(variantId: string): void {
    queue.enqueue({
      type: 'render',
      targetType: 'variant',
      targetId: variantId,
      workerClass: 'cpu',
      inputHash: stableHash(['render', RENDER_VERSION, variantId]),
    })
  }

  const ingest = new Ingest(repo, blobs, queue)

  if (opts.autostart !== false) queue.start()

  return {
    paths,
    repo,
    blobs,
    queue,
    ingest,
    async readThumbnailDataUrl(segmentId: string): Promise<string | null> {
      const uri = repo.getSegmentThumbnailUri(segmentId)
      if (!uri) return null
      const buf = await blobs.getBuffer(uri.replace('blobs/', ''))
      return `data:image/jpeg;base64,${buf.toString('base64')}`
    },
    createTeaser(assetId: string): { variantId: string } {
      const segmentIds = repo
        .listSegmentsByAsset(assetId)
        .filter((s) => s.hasThumbnail)
        .map((s) => s.id)
      if (segmentIds.length === 0) throw new Error('asset has no analyzed segments yet')
      const variantId = repo.createVariant({
        type: 'teaser',
        aspect: 'vertical',
        recipeJson: JSON.stringify({ kind: 'teaser', maxDurationMs: 30_000 }),
        sourceSegmentIds: segmentIds,
      })
      // A teaser is platform-bound → mandatory human verification before it leaves.
      repo.openReview(variantId, 'platform_bound_teaser')
      enqueueRender(variantId)
      return { variantId }
    },
    createCompilation(segmentIds: string[], aspect: Aspect): { variantId: string } {
      if (segmentIds.length === 0) throw new Error('no segments selected for compilation')
      const variantId = repo.createVariant({
        type: 'compilation',
        aspect,
        recipeJson: JSON.stringify({ kind: 'compilation' }),
        sourceSegmentIds: segmentIds,
      })
      enqueueRender(variantId)
      return { variantId }
    },
    createFanout(assetId: string): { variantIds: string[] } {
      const segmentIds = repo
        .listSegmentsByAsset(assetId)
        .filter((s) => s.hasThumbnail)
        .map((s) => s.id)
      if (segmentIds.length === 0) throw new Error('asset has no analyzed scenes yet')

      // One source → every output it'll ever need.
      const specs: Array<{
        type: VariantType
        aspect: Aspect
        recipe: Record<string, unknown>
        review: boolean
      }> = [
        { type: 'teaser', aspect: 'vertical', recipe: { kind: 'teaser', maxDurationMs: 30_000, colorNormalize: true }, review: true },
        { type: 'teaser', aspect: 'square', recipe: { kind: 'teaser', maxDurationMs: 30_000, colorNormalize: true }, review: true },
        { type: 'gif', aspect: 'vertical', recipe: { kind: 'gif', maxDurationMs: 6_000, format: 'gif' }, review: true },
        { type: 'paid', aspect: 'widescreen', recipe: { kind: 'paid', colorNormalize: true }, review: false },
      ]
      const variantIds = specs.map((s) => {
        const id = repo.createVariant({
          type: s.type,
          aspect: s.aspect,
          recipeJson: JSON.stringify(s.recipe),
          sourceSegmentIds: segmentIds,
        })
        if (s.review) repo.openReview(id, `platform_bound_${s.type}`)
        enqueueRender(id)
        return id
      })
      return { variantIds }
    },
    async exportWatermarked(variantId: string, fanLabel: string, destPath: string): Promise<void> {
      const variant = repo.getVariant(variantId)
      if (!variant?.storageUri) throw new Error('variant has no rendered output')
      if (variant.requiresReview && variant.reviewState !== 'approved') {
        throw new Error('blocked: approve this cut before exporting')
      }
      const inFile = join(paths.tmpDir, `${randomUUID()}.wm-src.mp4`)
      try {
        await blobs.getToFile(variant.storageUri.replace('blobs/', ''), inFile)
        await watermarkClip(inFile, fanLabel, destPath)
      } finally {
        await rm(inFile, { force: true })
      }
    },
    async exportVariant(variantId: string, destPath: string): Promise<void> {
      const variant = repo.getVariant(variantId)
      if (!variant?.storageUri) throw new Error('variant has no rendered output')
      // The gate: a platform-bound variant cannot leave until a human approves it.
      if (variant.requiresReview && variant.reviewState !== 'approved') {
        throw new Error('blocked: this teaser must be reviewed and approved before export')
      }
      await blobs.getToFile(variant.storageUri.replace('blobs/', ''), destPath)
    },
    getReview(variantId: string): ReviewInfo | null {
      const r = repo.getReview(variantId)
      if (!r) return null
      return {
        variantId,
        reason: r.reason,
        verdict: r.verdict,
        masks: r.masks,
        detectorAvailable: detector.available,
      }
    },
    setReviewMasks(variantId: string, masks: MaskRegion[]): void {
      repo.setReviewMasks(variantId, masks)
    },
    async approveReview(variantId: string): Promise<void> {
      const variant = repo.getVariant(variantId)
      if (!variant?.storageUri) throw new Error('variant has no rendered output')
      const review = repo.getReview(variantId)
      const masks = review?.masks ?? []

      // Re-render the deliverable with the verified masks blurred in, then swap it.
      const srcHash = variant.storageUri.replace('blobs/', '')
      const inFile = join(paths.tmpDir, `${randomUUID()}.in.mp4`)
      const outFile = join(paths.tmpDir, `${randomUUID()}.blur.mp4`)
      try {
        await blobs.getToFile(srcHash, inFile)
        const regions: BlurRegion[] = masks.map((m) => ({
          x: m.x,
          y: m.y,
          w: m.w,
          h: m.h,
          startSec: m.startSec,
          endSec: m.endSec,
        }))
        await blurRegions(inFile, regions, CANVASES[variant.aspect], outFile)
        const blob = await blobs.putFile(outFile)
        repo.replaceVariantBlob(variantId, blob.uri, variant.durationMs ?? 0)
        repo.setReviewVerdict(variantId, 'approved')
        notify() // push the unlocked/exportable state to the UI
      } finally {
        await rm(inFile, { force: true })
        await rm(outFile, { force: true })
      }
    },
    rejectReview(variantId: string): void {
      repo.setReviewVerdict(variantId, 'rejected')
      notify()
    },
    async readVariantFrameDataUrl(variantId: string): Promise<string | null> {
      const variant = repo.getVariant(variantId)
      if (!variant?.storageUri) return null
      const inFile = join(paths.tmpDir, `${randomUUID()}.frame-src.mp4`)
      const frame = join(paths.tmpDir, `${randomUUID()}.frame.jpg`)
      try {
        await blobs.getToFile(variant.storageUri.replace('blobs/', ''), inFile)
        await extractThumbnail(inFile, 500, frame)
        const { readFile } = await import('node:fs/promises')
        const buf = await readFile(frame)
        return `data:image/jpeg;base64,${buf.toString('base64')}`
      } finally {
        await rm(inFile, { force: true })
        await rm(frame, { force: true })
      }
    },
    close() {
      queue.stop()
      db.close()
    },
  }
}
