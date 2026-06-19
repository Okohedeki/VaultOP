// Model store — the backbone of "download on first use".
//
// ML models (whisper, CLIP, NudeNet, …) aren't bundled in the installer; the first
// time a feature needs one, it's fetched once and cached under userData/models,
// verified by sha256, and reused forever after (offline). Downloads report
// progress so the UI can say "Downloading captions model… 40%". Supports file://
// URLs so the logic is testable without the network.

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ModelSpec {
  /** Filename under the models dir, e.g. "ggml-base.en.bin". */
  name: string
  url: string
  /** Optional integrity check; if set, a mismatch fails the download. */
  sha256?: string
  /** Optional known size, for progress when no content-length header. */
  sizeBytes?: number
}

export type ProgressFn = (fraction: number) => void

export class ModelStore {
  constructor(private readonly dir: string) {}

  pathFor(name: string): string {
    return join(this.dir, name)
  }

  has(name: string): boolean {
    return existsSync(this.pathFor(name))
  }

  /** Return a local path to the model, downloading + caching it if needed. */
  async ensure(spec: ModelSpec, onProgress?: ProgressFn): Promise<string> {
    const dest = this.pathFor(spec.name)
    if (existsSync(dest)) {
      if (!spec.sha256 || (await sha256File(dest)) === spec.sha256) return dest
    }
    await mkdir(this.dir, { recursive: true })
    const tmp = `${dest}.part`
    try {
      await download(spec.url, tmp, spec.sizeBytes, onProgress)
      if (spec.sha256) {
        const got = await sha256File(tmp)
        if (got !== spec.sha256) {
          throw new Error(`checksum mismatch for ${spec.name}: expected ${spec.sha256}, got ${got}`)
        }
      }
      await rename(tmp, dest)
      return dest
    } finally {
      await rm(tmp, { force: true })
    }
  }
}

async function sha256File(path: string): Promise<string> {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer)
  return h.digest('hex')
}

async function download(
  url: string,
  dest: string,
  sizeBytes: number | undefined,
  onProgress?: ProgressFn,
): Promise<void> {
  const out = createWriteStream(dest)
  const finish = (): Promise<void> =>
    new Promise((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())))

  if (url.startsWith('file://')) {
    const src = fileURLToPath(url)
    const total = sizeBytes ?? (await stat(src)).size
    let read = 0
    for await (const chunk of createReadStream(src)) {
      const b = chunk as Buffer
      read += b.length
      out.write(b)
      if (total) onProgress?.(Math.min(1, read / total))
    }
    await finish()
    return
  }

  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`download failed (${res.status}) for ${url}`)
  const total = sizeBytes ?? (Number(res.headers.get('content-length')) || 0)
  let read = 0
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    const b = Buffer.from(chunk)
    read += b.length
    out.write(b)
    if (total) onProgress?.(Math.min(1, read / total))
  }
  await finish()
}
