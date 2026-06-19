// Speech transcription — whisper via transformers.js (WASM/ONNX), downloaded on
// first use and cached. Loaded lazily through a non-literal specifier so the app
// never hard-depends on it at build time: if the package or model isn't available
// (offline first run, etc.), transcription is skipped and the rest of the pipeline
// is unaffected. No native build, no Python.

import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BlobStore } from './blobstore'
import type { VaultPaths } from './paths'
import type { Repo } from './repo'
import type { JobContext, JobHandler } from './queue'
import { extractAudioWav, probeHasAudio } from './ffmpeg'
import { log } from './log'

export const TRANSCRIBE_VERSION = 'transcribe-v1'

export interface TranscriptChunk {
  startMs: number
  endMs: number
  text: string
}
export interface TranscriptResult {
  text: string
  chunks: TranscriptChunk[]
}

export interface Transcriber {
  readonly id: string
  transcribe(wavPath: string): Promise<TranscriptResult>
}

/** No-op transcriber for tests / VAULTOP_NO_ML — skips speech-to-text. */
export class NullTranscriber implements Transcriber {
  readonly id = 'null'
  async transcribe(): Promise<TranscriptResult> {
    return { text: '', chunks: [] }
  }
}

/** whisper-tiny.en via transformers.js; model fetched + cached on first call. */
export class WhisperTranscriber implements Transcriber {
  readonly id = 'whisper-tiny.en'
  private pipe: unknown = null

  constructor(private readonly cacheDir: string) {}

  private async ensurePipe(): Promise<(audio: Float32Array, opts: unknown) => Promise<{ text?: string; chunks?: Array<{ timestamp: [number, number]; text: string }> }>> {
    if (this.pipe) return this.pipe as never
    const specifier = '@huggingface/transformers'
    // Non-literal import → not statically bundled; loads from node_modules at runtime.
    const tf = (await import(specifier)) as {
      env: { cacheDir: string; allowLocalModels: boolean }
      pipeline: (task: string, model: string) => Promise<unknown>
    }
    tf.env.cacheDir = this.cacheDir
    tf.env.allowLocalModels = false
    this.pipe = await tf.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en')
    return this.pipe as never
  }

  async transcribe(wavPath: string): Promise<TranscriptResult> {
    const pipe = await this.ensurePipe()
    const audio = await readWavMono16k(wavPath)
    const out = await pipe(audio, { return_timestamps: true, chunk_length_s: 30 })
    const chunks: TranscriptChunk[] = (out.chunks ?? []).map((c) => ({
      startMs: Math.round((c.timestamp?.[0] ?? 0) * 1000),
      endMs: Math.round((c.timestamp?.[1] ?? 0) * 1000),
      text: (c.text || '').trim(),
    }))
    return { text: (out.text || '').trim(), chunks }
  }
}

/** Decode a mono 16-bit PCM WAV into normalized Float32 samples. */
async function readWavMono16k(path: string): Promise<Float32Array> {
  const buf = await readFile(path)
  let off = 12 // skip RIFF header
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'data') {
      const start = off + 8
      const n = Math.floor(size / 2)
      const f = new Float32Array(n)
      for (let i = 0; i < n; i++) f[i] = buf.readInt16LE(start + i * 2) / 32768
      return f
    }
    off += 8 + size + (size % 2)
  }
  // Fallback: assume a standard 44-byte header.
  const start = 44
  const n = Math.floor((buf.length - start) / 2)
  const f = new Float32Array(n)
  for (let i = 0; i < n; i++) f[i] = buf.readInt16LE(start + i * 2) / 32768
  return f
}

/** Job: master audio → transcript, stored per scene (best-effort, never fatal). */
export function makeTranscribeHandler(deps: {
  repo: Repo
  blobs: BlobStore
  paths: VaultPaths
  transcriber: Transcriber
}): JobHandler {
  const { repo, blobs, paths, transcriber } = deps

  return async function transcribe({ job, setProgress }: JobContext): Promise<void> {
    const assetId = job.targetId
    const master = repo.getMasterByAsset(assetId)
    if (!master) return

    const masterHash = master.storageUri.replace('blobs/', '')
    const plaintext = join(paths.tmpDir, `${randomUUID()}.master.mp4`)
    const wav = join(paths.tmpDir, `${randomUUID()}.wav`)
    try {
      await blobs.getToFile(masterHash, plaintext)
      if (!(await probeHasAudio(plaintext))) {
        log.info('transcribe.no_audio', { assetId })
        return
      }
      await extractAudioWav(plaintext, wav)
      setProgress(0.2)

      const result = await transcriber.transcribe(wav)
      setProgress(0.9)

      // Keep the verbatim timestamped chunks for caption mapping (E3)…
      repo.setTranscriptChunks(master.id, result.chunks)

      // …and the merged per-scene text for search.
      const segs = repo.listSegmentsByAsset(assetId)
      for (const s of segs) {
        const text = result.chunks
          .filter((c) => c.endMs > s.startMs && c.startMs < s.endMs)
          .map((c) => c.text)
          .join(' ')
          .trim()
        if (text) repo.setSegmentTranscript(s.id, text)
      }
      log.info('transcribe.done', { assetId, chars: result.text.length })
    } catch (e) {
      // Best-effort: a missing model / offline first-run must not fail ingest.
      log.warn('transcribe.skipped', { assetId, error: e instanceof Error ? e.message : String(e) })
    } finally {
      await rm(plaintext, { force: true })
      await rm(wav, { force: true })
    }
  }
}
