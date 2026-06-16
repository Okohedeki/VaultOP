// Ingest: the drag-drop entry point. Each dropped file is encrypted into the blob
// store (which content-hashes it), deduped against existing assets, recorded as an
// Asset row, and queued for transcode. Returns what was added vs. what already
// existed so the UI can tell the user honestly.

import { basename } from 'node:path'
import type { BlobStore } from './blobstore'
import type { Queue } from './queue'
import type { Repo } from './repo'
import { stableHash } from './hash'
import { TRANSCODE_VERSION } from './transcode'
import { log } from './log'

export interface IngestResult {
  added: Array<{ assetId: string; filename: string }>
  duplicates: Array<{ assetId: string; filename: string }>
}

export class Ingest {
  constructor(
    private readonly repo: Repo,
    private readonly blobs: BlobStore,
    private readonly queue: Queue,
  ) {}

  async addFiles(paths: string[]): Promise<IngestResult> {
    const result: IngestResult = { added: [], duplicates: [] }

    for (const path of paths) {
      const filename = basename(path)
      const blob = await this.blobs.putFile(path)

      const existing = this.repo.findAssetByHash(blob.hash)
      if (existing) {
        result.duplicates.push({ assetId: existing.id, filename })
        log.info('ingest.duplicate', { filename, assetId: existing.id })
        continue
      }

      const asset = this.repo.createAsset({
        contentHash: blob.hash,
        originalFilename: filename,
        bytes: blob.bytes,
      })
      this.repo.setAssetStorageUri(asset.id, blob.uri)

      this.queue.enqueue({
        type: 'transcode',
        targetType: 'asset',
        targetId: asset.id,
        workerClass: 'cpu',
        inputHash: stableHash(['transcode', TRANSCODE_VERSION, asset.id]),
      })

      result.added.push({ assetId: asset.id, filename })
      log.info('ingest.added', { filename, assetId: asset.id })
    }

    return result
  }
}
