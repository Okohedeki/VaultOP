import { describe, expect, it } from 'vitest'
import { buildSegmentRanges } from '../electron/main/segments'

describe('buildSegmentRanges', () => {
  it('returns a single full-length segment when there are no cuts', () => {
    expect(buildSegmentRanges([], 10_000)).toEqual([{ startMs: 0, endMs: 10_000 }])
  })

  it('splits at cut points', () => {
    expect(buildSegmentRanges([3000, 6000], 9000, 500)).toEqual([
      { startMs: 0, endMs: 3000 },
      { startMs: 3000, endMs: 6000 },
      { startMs: 6000, endMs: 9000 },
    ])
  })

  it('merges sub-minimum slices into the previous segment', () => {
    // A 100ms sliver at 3000 should fold into the prior segment.
    expect(buildSegmentRanges([3000, 3100], 9000, 1200)).toEqual([
      { startMs: 0, endMs: 3100 },
      { startMs: 3100, endMs: 9000 },
    ])
  })

  it('ignores out-of-range and duplicate cuts', () => {
    expect(buildSegmentRanges([-5, 0, 5000, 5000, 99_999], 8000, 500)).toEqual([
      { startMs: 0, endMs: 5000 },
      { startMs: 5000, endMs: 8000 },
    ])
  })
})
