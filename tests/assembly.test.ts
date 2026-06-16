import { describe, expect, it } from 'vitest'
import { capToDuration, CANVASES } from '../electron/main/assembly'

describe('capToDuration', () => {
  const segs = [
    { startMs: 0, endMs: 10_000 },
    { startMs: 0, endMs: 10_000 },
    { startMs: 0, endMs: 10_000 },
  ]

  it('returns all segments when no cap is set', () => {
    expect(capToDuration(segs, undefined)).toHaveLength(3)
  })

  it('trims the final segment to hit the cap exactly', () => {
    const out = capToDuration(segs, 25_000)
    expect(out).toHaveLength(3)
    expect(out[2]).toEqual({ startMs: 0, endMs: 5_000 })
    const total = out.reduce((n, s) => n + (s.endMs - s.startMs), 0)
    expect(total).toBe(25_000)
  })

  it('stops early when the cap is reached on a boundary', () => {
    const out = capToDuration(segs, 20_000)
    expect(out).toHaveLength(2)
  })
})

describe('canvas presets', () => {
  it('defines the three target aspects at 30fps', () => {
    expect(CANVASES.vertical).toEqual({ width: 1080, height: 1920, fps: 30 })
    expect(CANVASES.widescreen).toEqual({ width: 1920, height: 1080, fps: 30 })
    expect(CANVASES.square.width).toBe(CANVASES.square.height)
  })
})
