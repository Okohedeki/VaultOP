// Segment analysis — the layer that makes the vault searchable.
//
// The default analyzer is fully native and needs zero model downloads: it asks
// ffmpeg for a tiny 8x8 RGB rendering of a segment's keyframe and derives
//   • a normalized color-histogram embedding (192-dim) → visual "find similar"
//   • brightness / tone / duration tags
// This works the moment you install the app. An optional ONNX CLIP analyzer can
// drop in behind the same interface for semantic tags (see analyzer.onnx notes in
// docs/research.md) without changing any caller.

import { spawn } from 'node:child_process'
import { FFMPEG_BIN } from './ffmpeg'

export interface AnalyzerTag {
  key: string
  value: string
  confidence: number
}

export interface SegmentAnalysis {
  embedding: Float32Array
  tags: AnalyzerTag[]
}

export interface Analyzer {
  /** Analyze a segment given its keyframe image and length. */
  analyze(input: { thumbnailPath: string; durationMs: number }): Promise<SegmentAnalysis>
  readonly version: string
}

const GRID = 8 // 8x8 RGB → 192 features

export class NativeAnalyzer implements Analyzer {
  readonly version = 'native-hist-v1'

  async analyze(input: { thumbnailPath: string; durationMs: number }): Promise<SegmentAnalysis> {
    const rgb = await renderRgb(input.thumbnailPath, GRID)
    const embedding = normalize(Float32Array.from(rgb, (v) => v / 255))

    // Brightness (perceived luma) across the frame.
    let lumaSum = 0
    let rSum = 0
    let bSum = 0
    const px = rgb.length / 3
    for (let i = 0; i < rgb.length; i += 3) {
      const r = rgb[i]!
      const g = rgb[i + 1]!
      const b = rgb[i + 2]!
      lumaSum += 0.2126 * r + 0.7152 * g + 0.0722 * b
      rSum += r
      bSum += b
    }
    const luma = lumaSum / px

    const tags: AnalyzerTag[] = [
      { key: 'lighting', value: bucketLighting(luma), confidence: 0.7 },
      { key: 'tone', value: rSum >= bSum ? 'warm' : 'cool', confidence: 0.6 },
      { key: 'length', value: bucketLength(input.durationMs), confidence: 1 },
    ]

    return { embedding, tags }
  }
}

function bucketLighting(luma: number): string {
  if (luma < 60) return 'dark'
  if (luma < 130) return 'dim'
  return 'bright'
}

function bucketLength(ms: number): string {
  if (ms < 10_000) return 'short'
  if (ms < 60_000) return 'medium'
  return 'long'
}

function normalize(v: Float32Array): Float32Array {
  let mag = 0
  for (const x of v) mag += x * x
  mag = Math.sqrt(mag) || 1
  for (let i = 0; i < v.length; i++) v[i]! /= mag
  return v
}

/** Render an image down to gridxgrid raw RGB bytes via native ffmpeg. */
function renderRgb(input: string, grid: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, [
      '-i',
      input,
      '-vf',
      `scale=${grid}:${grid}`,
      '-frames:v',
      '1',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ])
    const chunks: Buffer[] = []
    let err = ''
    child.stdout.on('data', (d) => chunks.push(d as Buffer))
    child.stderr.on('data', (d) => (err += d))
    child.on('error', reject)
    child.on('close', (code) => {
      const buf = Buffer.concat(chunks)
      if (code === 0 && buf.length >= grid * grid * 3) resolve(buf.subarray(0, grid * grid * 3))
      else reject(new Error(`rawvideo extract failed (${code}): ${err.slice(-200)}`))
    })
  })
}

/** Cosine similarity for two equal-length normalized vectors. */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!
  return dot
}

export function embeddingToBuffer(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
}

export function bufferToEmbedding(b: Buffer): Float32Array {
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)
}
