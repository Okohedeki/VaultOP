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
