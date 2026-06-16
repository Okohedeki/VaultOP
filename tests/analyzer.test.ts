import { describe, expect, it } from 'vitest'
import { bufferToEmbedding, cosine, embeddingToBuffer } from '../electron/main/analyzer'

describe('embedding vector helpers', () => {
  it('cosine of identical unit vectors is ~1, orthogonal is ~0', () => {
    const a = new Float32Array([1, 0, 0])
    const b = new Float32Array([1, 0, 0])
    const c = new Float32Array([0, 1, 0])
    expect(cosine(a, b)).toBeCloseTo(1, 5)
    expect(cosine(a, c)).toBeCloseTo(0, 5)
  })

  it('returns 0 for mismatched lengths', () => {
    expect(cosine(new Float32Array([1, 2]), new Float32Array([1, 2, 3]))).toBe(0)
  })

  it('round-trips an embedding through a Buffer', () => {
    const v = new Float32Array([0.1, -0.2, 0.3, 0.9])
    const restored = bufferToEmbedding(embeddingToBuffer(v))
    expect(Array.from(restored)).toEqual(Array.from(v))
  })
})
