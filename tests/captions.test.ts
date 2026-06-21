import { describe, expect, it } from 'vitest'
import {
  buildAssFromOverlays,
  buildCues,
  buildSrtFromEdl,
  type CaptionClip,
  type TranscriptChunk,
} from '../electron/main/captions'

const M = 'master-1'
const transcripts = new Map<string, TranscriptChunk[]>([
  [
    M,
    [
      { startMs: 0, endMs: 500, text: 'hello' },
      { startMs: 500, endMs: 1000, text: 'world' },
      { startMs: 1000, endMs: 2000, text: 'fast talk' },
      { startMs: 2500, endMs: 3000, text: 'unused' },
    ],
  ],
])

describe('caption mapping (EDL → output timeline)', () => {
  it('maps chunks across clips with offset + speed', () => {
    const clips: CaptionClip[] = [
      { masterId: M, startMs: 0, endMs: 1000, speed: 1 }, // out 0–1000
      { masterId: M, startMs: 1000, endMs: 2000, speed: 2 }, // out 1000–1500
    ]
    const cues = buildCues(clips, transcripts)
    expect(cues).toEqual([
      { startMs: 0, endMs: 500, text: 'hello' },
      { startMs: 500, endMs: 1000, text: 'world' },
      { startMs: 1000, endMs: 1500, text: 'fast talk' }, // 2× → compressed
    ])
  })

  it('clips chunks to clip bounds and ignores non-overlapping speech', () => {
    const clips: CaptionClip[] = [{ masterId: M, startMs: 600, endMs: 900, speed: 1 }]
    const cues = buildCues(clips, transcripts)
    // Only 'world' (500–1000) overlaps [600,900] → clipped to [600,900] → out [0,300].
    expect(cues).toEqual([{ startMs: 0, endMs: 300, text: 'world' }])
  })

  it('renders SRT with HH:MM:SS,mmm timing', () => {
    const clips: CaptionClip[] = [{ masterId: M, startMs: 0, endMs: 1000, speed: 1 }]
    const srt = buildSrtFromEdl(clips, transcripts)
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:00,500\nhello')
    expect(srt).toContain('2\n00:00:00,500 --> 00:00:01,000\nworld')
    expect(srt.endsWith('\n')).toBe(true)
  })

  it('returns empty string when there is no overlapping speech', () => {
    const clips: CaptionClip[] = [{ masterId: 'other', startMs: 0, endMs: 1000, speed: 1 }]
    expect(buildSrtFromEdl(clips, transcripts)).toBe('')
  })
})

describe('text overlays → ASS', () => {
  const canvas = { width: 1080, height: 1920 }

  it('positions overlays via \\an alignment and ASS timing', () => {
    const ass = buildAssFromOverlays(
      [
        { text: 'Hello', startMs: 0, endMs: 2000, position: 'top' },
        { text: 'Bye', startMs: 2000, endMs: 4500, position: 'center' },
      ],
      canvas,
    )
    expect(ass).toContain('PlayResX: 1080')
    expect(ass).toContain('PlayResY: 1920')
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,{\\an8}Hello')
    expect(ass).toContain('Dialogue: 0,0:00:02.00,0:00:04.50,Default,,0,0,0,,{\\an5}Bye')
  })

  it('strips braces, skips empty / zero-length, and returns empty doc for none', () => {
    expect(buildAssFromOverlays([], canvas)).toBe('')
    expect(buildAssFromOverlays([{ text: '   ', startMs: 0, endMs: 1000, position: 'bottom' }], canvas)).toBe('')
    const ass = buildAssFromOverlays([{ text: '{x}Safe', startMs: 0, endMs: 1000, position: 'bottom' }], canvas)
    expect(ass).toContain('{\\an2}xSafe')
  })
})
