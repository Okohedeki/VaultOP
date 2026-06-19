// Platform publish presets. A Promo is a Cut rendered *for a Platform*: reframed to
// the platform's aspect and capped to its max length, then sent through the blur gate.
// Specs are pragmatic defaults (the parked open question) — easy to tune later.

import type { Aspect } from './domain'

export interface PlatformPreset {
  key: string
  label: string
  aspect: Aspect
  /** Max output length in ms; null = no cap. */
  maxLengthMs: number | null
  hint: string
}

export const PLATFORMS: PlatformPreset[] = [
  { key: 'tiktok', label: 'TikTok', aspect: 'vertical', maxLengthMs: 180_000, hint: '9:16 · ≤3 min' },
  { key: 'reels', label: 'Reels', aspect: 'vertical', maxLengthMs: 90_000, hint: '9:16 · ≤90s' },
  { key: 'feed', label: 'IG Feed', aspect: 'square', maxLengthMs: 60_000, hint: '1:1 · ≤60s' },
  { key: 'youtube', label: 'YouTube', aspect: 'widescreen', maxLengthMs: null, hint: '16:9 · full' },
  { key: 'reddit', label: 'Reddit', aspect: 'vertical', maxLengthMs: 900_000, hint: '9:16 · ≤15 min' },
]

export const PLATFORM_BY_KEY: Record<string, PlatformPreset> = Object.fromEntries(
  PLATFORMS.map((p) => [p.key, p]),
)
