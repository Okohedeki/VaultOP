// Caption mapping: turn a Master's verbatim timestamped transcript into an SRT for
// a Cut. Each EDL clip references a source window on a Master; this maps every
// overlapping transcript chunk onto the Cut's output timeline, accounting for the
// clip's playback speed and the running offset of earlier clips. Pure + testable.

export interface CaptionClip {
  masterId: string
  startMs: number
  endMs: number
  speed: number
}

export interface TranscriptChunk {
  startMs: number
  endMs: number
  text: string
}

interface Cue {
  startMs: number
  endMs: number
  text: string
}

/** Map EDL clips + per-Master transcripts onto the output timeline as ordered cues. */
export function buildCues(
  clips: CaptionClip[],
  transcriptsByMaster: Map<string, TranscriptChunk[]>,
): Cue[] {
  const cues: Cue[] = []
  let outBase = 0
  for (const clip of clips) {
    const speed = clip.speed > 0 ? clip.speed : 1
    const chunks = transcriptsByMaster.get(clip.masterId) ?? []
    for (const c of chunks) {
      // Overlap of the chunk with this clip's source window.
      const cs = Math.max(c.startMs, clip.startMs)
      const ce = Math.min(c.endMs, clip.endMs)
      if (ce <= cs) continue
      const text = c.text.trim()
      if (!text) continue
      const outStart = outBase + (cs - clip.startMs) / speed
      const outEnd = outBase + (ce - clip.startMs) / speed
      cues.push({
        startMs: Math.round(outStart),
        endMs: Math.max(Math.round(outEnd), Math.round(outStart) + 1),
        text,
      })
    }
    outBase += (clip.endMs - clip.startMs) / speed
  }
  return cues
}

export interface TextOverlayItem {
  text: string
  startMs: number
  endMs: number
  position: 'top' | 'center' | 'bottom'
}

interface Canvas {
  width: number
  height: number
}

function assTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const h = Math.floor(total / 3_600_000)
  const m = Math.floor((total % 3_600_000) / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const cs = Math.floor((total % 1000) / 10)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${h}:${p(m)}:${p(s)}.${p(cs)}`
}

const AN_BY_POSITION: Record<TextOverlayItem['position'], number> = { top: 8, center: 5, bottom: 2 }

/** Escape ASS dialogue text: drop braces (override-block delimiters) and newlines. */
function assText(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\r?\n/g, '\\N').trim()
}

/** Build an ASS subtitle doc placing manual text overlays at their positions/times.
 *  Burned through the same libass path as captions (font-safe). '' if no overlays. */
export function buildAssFromOverlays(overlays: TextOverlayItem[], canvas: Canvas): string {
  const items = overlays.filter((o) => o.endMs > o.startMs && o.text.trim())
  if (items.length === 0) return ''
  const fontSize = Math.max(18, Math.round(canvas.height / 18))
  const marginV = Math.round(canvas.height / 12)
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${canvas.width}`,
    `PlayResY: ${canvas.height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Arial,${fontSize},&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,3,1,2,40,40,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n')
  const events = items
    .map(
      (o) =>
        `Dialogue: 0,${assTime(o.startMs)},${assTime(o.endMs)},Default,,0,0,0,,{\\an${AN_BY_POSITION[o.position]}}${assText(o.text)}`,
    )
    .join('\n')
  return `${header}\n${events}\n`
}

function srtTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const h = Math.floor(total / 3_600_000)
  const m = Math.floor((total % 3_600_000) / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)},${p(millis, 3)}`
}

/** Build an SRT document from EDL clips + transcripts. Empty string if no captions. */
export function buildSrtFromEdl(
  clips: CaptionClip[],
  transcriptsByMaster: Map<string, TranscriptChunk[]>,
): string {
  const cues = buildCues(clips, transcriptsByMaster)
  if (cues.length === 0) return ''
  return (
    cues
      .map(
        (cue, i) =>
          `${i + 1}\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\n${cue.text}`,
      )
      .join('\n\n') + '\n'
  )
}
