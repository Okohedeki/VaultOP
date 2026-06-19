// Thin wrapper over the bundled ffmpeg/ffprobe binaries. Each platform build ships
// its own binaries via ffmpeg-static/ffprobe-static (electron-builder asarUnpack),
// so VaultOP never depends on a system ffmpeg.

import { spawn } from 'node:child_process'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { log } from './log'

/** In a packaged app the binary lives in app.asar.unpacked, not app.asar. */
function unpacked(p: string): string {
  return p.replace('app.asar', 'app.asar.unpacked')
}

export const FFMPEG_BIN = unpacked((ffmpegStatic as unknown as string) ?? 'ffmpeg')
export const FFPROBE_BIN = unpacked(ffprobeStatic.path ?? 'ffprobe')

export interface ProbeResult {
  width: number
  height: number
  fps: number
  durationMs: number
  codec: string
  raw: unknown
}

export async function ffprobe(input: string): Promise<ProbeResult> {
  const args = [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    input,
  ]
  const out = await run(FFPROBE_BIN, args)
  const json = JSON.parse(out) as {
    streams?: Array<Record<string, unknown>>
    format?: Record<string, unknown>
  }
  const video = (json.streams ?? []).find((s) => s.codec_type === 'video')
  if (!video) throw new Error('no video stream found')

  const fps = parseRational(String(video.avg_frame_rate ?? video.r_frame_rate ?? '0/1'))
  const durationSec = Number(json.format?.duration ?? video.duration ?? 0)

  return {
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    fps,
    durationMs: Math.round(durationSec * 1000),
    codec: String(video.codec_name ?? 'unknown'),
    raw: json,
  }
}

/** Normalize any source into a faststart H.264 / yuv420p master with AAC audio. */
export async function transcodeToMaster(
  input: string,
  output: string,
  durationMs: number,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const args = [
    '-y',
    '-i',
    input,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    output,
  ]
  await runWithProgress(FFMPEG_BIN, args, durationMs, onProgress)
}

/**
 * Native scene detection. Runs the `select=gt(scene,T)` filter with metadata
 * printing and returns the cut timestamps (ms) where a shot change occurs.
 * No Python — just the bundled ffmpeg.
 */
export async function detectSceneCuts(input: string, threshold = 0.4): Promise<number[]> {
  // metadata=print:file=- → stdout; route the null muxer to the OS null device so
  // the two don't both fight over '-'.
  const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null'
  const args = [
    '-i',
    input,
    '-filter:v',
    `select='gt(scene,${threshold})',metadata=print:file=-`,
    '-an',
    '-f',
    'null',
    nullDevice,
  ]
  const out = await run(FFMPEG_BIN, args)
  const cuts: number[] = []
  for (const line of out.split('\n')) {
    const m = line.match(/pts_time:([0-9.]+)/)
    if (m && m[1]) cuts.push(Math.round(parseFloat(m[1]) * 1000))
  }
  return cuts
}

/** Extract a single keyframe at `atMs` as a JPEG. */
export async function extractThumbnail(input: string, atMs: number, output: string): Promise<void> {
  const args = [
    '-ss',
    (atMs / 1000).toFixed(3),
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    'scale=320:-2',
    '-q:v',
    '4',
    '-y',
    output,
  ]
  await run(FFMPEG_BIN, args)
}

export interface Canvas {
  width: number
  height: number
  fps: number
}

/** Does this file have an audio stream? */
export async function probeHasAudio(input: string): Promise<boolean> {
  const out = await run(FFPROBE_BIN, [
    '-v',
    'quiet',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=index',
    '-of',
    'csv=p=0',
    input,
  ])
  return out.trim().length > 0
}

/**
 * Render one segment of a master into a normalized MPEG-TS clip that fills the
 * canvas (scale-to-cover + center-crop → clean reframe), always with a stereo
 * audio track (silent if the source has none). TS clips concat losslessly.
 */
export async function renderNormalizedClip(opts: {
  master: string
  startMs: number
  endMs: number
  canvas: Canvas
  hasAudio: boolean
  output: string
  colorNormalize?: boolean
}): Promise<void> {
  const { master, startMs, endMs, canvas, hasAudio, output } = opts
  const dur = (endMs - startMs) / 1000
  // Optional gentle color/levels "pop" so promo cuts look graded, not flat.
  const grade = opts.colorNormalize ? ',eq=contrast=1.05:saturation=1.07:brightness=0.012' : ''
  const vf =
    `scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=increase,` +
    `crop=${canvas.width}:${canvas.height},setsar=1,fps=${canvas.fps}${grade},format=yuv420p`

  const args = ['-ss', (startMs / 1000).toFixed(3), '-t', dur.toFixed(3), '-i', master]
  if (!hasAudio) {
    args.push('-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
  }
  args.push(
    '-filter:v',
    vf,
    '-map',
    '0:v:0',
    '-map',
    hasAudio ? '0:a:0' : '1:a:0',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-muxpreload',
    '0',
    '-muxdelay',
    '0',
    '-f',
    'mpegts',
    '-y',
    output,
  )
  await run(FFMPEG_BIN, args)
}

export interface BlurRegion {
  /** Normalized 0..1 box within the frame. */
  x: number
  y: number
  w: number
  h: number
  /** Optional active time window (seconds); omitted → whole clip. */
  startSec?: number
  endSec?: number
}

/**
 * Apply tracked-region blur over an existing clip. Each region is cropped, heavily
 * blurred, and overlaid back, optionally gated to a time window. This is the
 * masking primitive behind both teaser (explicit) and privacy redaction.
 */
export async function blurRegions(
  input: string,
  regions: BlurRegion[],
  canvas: Canvas,
  output: string,
): Promise<void> {
  if (regions.length === 0) {
    // Nothing to blur — still re-emit so the caller has a single output path.
    await run(FFMPEG_BIN, ['-i', input, '-c', 'copy', '-y', output])
    return
  }

  // Build a filter chain: per region, split the stream, blur a crop of one branch,
  // overlay it back onto the other. `split` is required — a pad feeds one filter.
  const parts: string[] = []
  let cur = '[0:v]'
  regions.forEach((r, i) => {
    const x = Math.round(r.x * canvas.width)
    const y = Math.round(r.y * canvas.height)
    const w = Math.max(2, Math.round(r.w * canvas.width))
    const h = Math.max(2, Math.round(r.h * canvas.height))
    const enable =
      r.startSec != null && r.endSec != null
        ? `:enable='between(t,${r.startSec},${r.endSec})'`
        : ''
    parts.push(`${cur}split[base${i}][crop${i}]`)
    parts.push(`[crop${i}]crop=${w}:${h}:${x}:${y},boxblur=18:2[blur${i}]`)
    parts.push(`[base${i}][blur${i}]overlay=${x}:${y}${enable}[o${i}]`)
    cur = `[o${i}]`
  })
  const filter = parts.join(';')
  const last = cur

  await run(FFMPEG_BIN, [
    '-i',
    input,
    '-filter_complex',
    filter,
    '-map',
    last,
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    '-y',
    output,
  ])
}

/** Convert a rendered MP4 into a high-quality looping preview GIF. */
export async function renderGif(
  input: string,
  output: string,
  opts: { fps?: number; width?: number } = {},
): Promise<void> {
  const fps = opts.fps ?? 12
  const width = opts.width ?? 480
  const vf = `fps=${fps},scale=${width}:-1:flags=lanczos`
  await run(FFMPEG_BIN, [
    '-i',
    input,
    '-vf',
    `${vf},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
    '-loop',
    '0',
    '-y',
    output,
  ])
}

/** Burn a per-fan forensic watermark (visible ID) into a clip — feeds leak tracking. */
export async function watermarkClip(
  input: string,
  label: string,
  output: string,
): Promise<void> {
  const text = label.replace(/[\\:']/g, '')
  const draw =
    `drawtext=text='${text}':fontcolor=white@0.10:fontsize=h/26:x=w-tw-20:y=h-th-20:` +
    `shadowcolor=black@0.25:shadowx=1:shadowy=1`
  await run(FFMPEG_BIN, [
    '-i',
    input,
    '-vf',
    draw,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    '-y',
    output,
  ])
}

/** Losslessly concat normalized TS clips into a faststart MP4. */
export async function concatClips(listFile: string, output: string): Promise<void> {
  await run(FFMPEG_BIN, [
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    '-y',
    output,
  ])
}

// ── internals ────────────────────────────────────────────────────────────────

function parseRational(r: string): number {
  const parts = r.split('/')
  const num = Number(parts[0] ?? 0)
  const den = Number(parts[1] ?? 1)
  if (!den) return num || 0
  return num / den
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', reject)
    child.on('close', (code, signal) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${bin} exited code=${code} signal=${signal}: ${stderr.slice(-500)}`)),
    )
  })
}

function runWithProgress(
  bin: string,
  args: string[],
  durationMs: number,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args)
    let stderrTail = ''
    let buf = ''

    child.stdout.on('data', (d) => {
      buf += String(d)
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const [key, value] = line.split('=')
        if (key === 'out_time_us' && durationMs > 0) {
          const outMs = Number(value) / 1000
          onProgress(Math.max(0, Math.min(0.99, outMs / durationMs)))
        } else if (key === 'progress' && value === 'end') {
          onProgress(1)
        }
      }
    })
    child.stderr.on('data', (d) => {
      stderrTail = (stderrTail + d).slice(-1000)
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        log.error('ffmpeg.failed', { code, signal, stderr: stderrTail })
        reject(new Error(`ffmpeg exited code=${code} signal=${signal}: ${stderrTail.slice(-500)}`))
      }
    })
  })
}
