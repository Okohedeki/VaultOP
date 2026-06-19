// Semantic auto-tagging — CLIP zero-shot via transformers.js (download on first
// use). Gives the spec's "setting" and "who's in frame" tags that the native
// histogram analyzer can't. Lazy-loaded + best-effort: if unavailable, tagging is
// skipped and the heuristic tags (lighting/tone/length) still apply.

import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import type { BlobStore } from './blobstore'
import type { VaultPaths } from './paths'
import type { Repo } from './repo'
import type { JobContext, JobHandler } from './queue'
import { log } from './log'

export const TAG_VERSION = 'clip-tag-v1'

export interface TagResult {
  key: string
  value: string
  confidence: number
}
export interface SemanticTagger {
  tag(imagePath: string): Promise<TagResult[]>
}

export class NullTagger implements SemanticTagger {
  async tag(): Promise<TagResult[]> {
    return []
  }
}

const SETTINGS = [
  'a bedroom', 'a bathroom', 'a kitchen', 'a living room', 'an outdoor scene',
  'a studio', 'a car', 'a pool', 'a hotel room', 'a gym', 'an office', 'a shower',
]
const PEOPLE = ['one person', 'two people', 'a group of people']

/** CLIP zero-shot tagger (Xenova/clip-vit-base-patch32). */
export class ClipTagger implements SemanticTagger {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipe: any = null

  constructor(private readonly cacheDir: string) {}

  private async ensure(): Promise<(img: string, labels: string[]) => Promise<Array<{ label: string; score: number }>>> {
    if (this.pipe) return this.pipe
    const specifier = '@huggingface/transformers'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tf = (await import(specifier)) as any
    tf.env.cacheDir = this.cacheDir
    tf.env.allowLocalModels = false
    this.pipe = await tf.pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32')
    return this.pipe
  }

  async tag(imagePath: string): Promise<TagResult[]> {
    const pipe = await this.ensure()
    const out: TagResult[] = []

    const setting = await pipe(imagePath, SETTINGS)
    if (setting[0] && setting[0].score > 0.35) {
      out.push({ key: 'setting', value: setting[0].label.replace(/^an? /, ''), confidence: setting[0].score })
    }
    const people = await pipe(imagePath, PEOPLE)
    if (people[0] && people[0].score > 0.5) {
      out.push({ key: 'people', value: people[0].label, confidence: people[0].score })
    }
    return out
  }
}

/** Job: CLIP-tag every scene from its keyframe (best-effort, never fatal). */
export function makeTagHandler(deps: {
  repo: Repo
  blobs: BlobStore
  paths: VaultPaths
  tagger: SemanticTagger
}): JobHandler {
  const { repo, blobs, paths, tagger } = deps

  return async function tag({ job, setProgress }: JobContext): Promise<void> {
    const assetId = job.targetId
    const segs = repo.listSegmentsByAsset(assetId)
    try {
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]!
        const uri = repo.getSegmentThumbnailUri(s.id)
        if (!uri) continue
        const jpg = join(paths.tmpDir, `${randomUUID()}.jpg`)
        try {
          const buf = await blobs.getBuffer(uri.replace('blobs/', ''))
          const { writeFile } = await import('node:fs/promises')
          await writeFile(jpg, buf)
          for (const t of await tagger.tag(jpg)) {
            repo.addTag({ segmentId: s.id, key: t.key, value: t.value, confidence: t.confidence })
          }
        } finally {
          await rm(jpg, { force: true })
        }
        setProgress((i + 1) / segs.length)
      }
      log.info('tag.done', { assetId, scenes: segs.length })
    } catch (e) {
      log.warn('tag.skipped', { assetId, error: e instanceof Error ? e.message : String(e) })
    }
  }
}
