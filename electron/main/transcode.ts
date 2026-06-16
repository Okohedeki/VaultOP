// Transcode worker: raw Asset → normalized Master.
//
// Decrypts the original blob into tmp (plaintext lives only here, transiently),
// probes it, transcodes to a faststart H.264 master, re-encrypts the master into
// the blob store, records the Master row, then wipes all plaintext. The asset
// walks uploaded → transcoding → ready.

import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import type { BlobStore } from './blobstore'
import type { VaultPaths } from './paths'
import type { Repo } from './repo'
import type { JobContext, JobHandler } from './queue'
import { ffprobe, transcodeToMaster } from './ffmpeg'
import { stableHash } from './hash'
import { SCENE_SPLIT_VERSION } from './segments'
import { log } from './log'

export const TRANSCODE_VERSION = 'transcode-v1'

export function makeTranscodeHandler(deps: {
  repo: Repo
  blobs: BlobStore
  paths: VaultPaths
}): JobHandler {
  const { repo, blobs, paths } = deps

  return async function transcode({ job, setProgress }: JobContext): Promise<void> {
    const assetId = job.targetId
    const asset = repo.getAsset(assetId)
    if (!asset) throw new Error(`asset ${assetId} not found`)

    repo.setAssetStatus(assetId, 'transcoding', null)

    const plaintextIn = join(paths.tmpDir, `${randomUUID()}.in`)
    const masterOut = join(paths.tmpDir, `${randomUUID()}.master.mp4`)

    try {
      // 1. Decrypt the original into tmp.
      await blobs.getToFile(asset.contentHash, plaintextIn)

      // 2. Probe and persist source metadata.
      const probe = await ffprobe(plaintextIn)
      repo.setAssetFfprobe(assetId, probe.raw)
      setProgress(0.05)

      // 3. Transcode to the working master.
      await transcodeToMaster(plaintextIn, masterOut, probe.durationMs, (f) =>
        setProgress(0.05 + f * 0.85),
      )

      // 4. Encrypt the master into the blob store.
      const blob = await blobs.putFile(masterOut)
      setProgress(0.95)

      repo.createMaster({
        assetId,
        storageUri: blob.uri,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        durationMs: probe.durationMs,
        codec: 'h264',
      })

      // Hand off to analysis: the asset isn't "ready" until it's sliceable.
      repo.setAssetStatus(assetId, 'analyzing', null)
      repo.enqueueJob({
        type: 'scene_split',
        targetType: 'asset',
        targetId: assetId,
        workerClass: 'cpu',
        inputHash: stableHash(['scene_split', SCENE_SPLIT_VERSION, assetId]),
      })
      setProgress(1)
      log.info('transcode.analyzing', { assetId, durationMs: probe.durationMs })
    } catch (e) {
      // Surface the failure on the asset too, not just the job.
      repo.setAssetStatus(assetId, 'failed', e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      // Always wipe transient plaintext, even on failure.
      await rm(plaintextIn, { force: true })
      await rm(masterOut, { force: true })
    }
  }
}
