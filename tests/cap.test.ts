import { describe, expect, it } from 'vitest'
import { capItemsToOutput } from '../electron/main/assembly'

type Item = { masterHash: string; startMs: number; endMs: number; speed: number }
const item = (startMs: number, endMs: number, speed = 1): Item => ({
  masterHash: 'h',
  startMs,
  endMs,
  speed,
})

describe('capItemsToOutput (Promo length cap, output time)', () => {
  it('returns items unchanged when no cap', () => {
    const items = [item(0, 1000), item(1000, 2000)]
    expect(capItemsToOutput(items, undefined)).toBe(items)
  })

  it('drops whole items past the budget and trims the boundary item', () => {
    // outputs: 1000 + 1000 + 1000 = 3000; cap at 1500 → keep first, trim second to 500ms.
    const out = capItemsToOutput([item(0, 1000), item(0, 1000), item(0, 1000)], 1500)
    expect(out).toHaveLength(2)
    expect(out[1]!.endMs).toBe(500)
  })

  it('accounts for speed when measuring output length', () => {
    // a 2× clip of source 0–2000 renders to 1000ms output; cap 500 → trim source to 1000.
    const out = capItemsToOutput([item(0, 2000, 2)], 500)
    expect(out).toHaveLength(1)
    expect(out[0]!.endMs).toBe(1000) // 500ms output × speed 2 = 1000ms source
  })
})
