// Shared domain vocabulary for VaultOP. Imported by main, preload, and renderer.
// Keep this free of Node/Electron/DOM imports so every layer can use it.

import { z } from 'zod'

/**
 * Asset lifecycle. The only thing the user drops. Status is a state machine —
 * transitions are enforced in the main process, never a free-form string.
 */
export const AssetStatus = z.enum(['uploaded', 'transcoding', 'analyzing', 'ready', 'failed'])
export type AssetStatus = z.infer<typeof AssetStatus>

/** Legal forward transitions for an Asset. Anything else is a bug and is rejected. */
export const ASSET_TRANSITIONS: Record<AssetStatus, readonly AssetStatus[]> = {
  uploaded: ['transcoding', 'failed'],
  transcoding: ['analyzing', 'ready', 'failed'],
  analyzing: ['ready', 'failed'],
  ready: [],
  failed: ['transcoding'], // retry path
}

/** Job types across all phases. Phase 0 only emits `transcode`. */
export const JobType = z.enum([
  'transcode',
  'scene_split',
  'thumbnail',
  'transcribe',
  'tag',
  'detect',
  'render',
])
export type JobType = z.infer<typeof JobType>

export const JobState = z.enum(['queued', 'running', 'done', 'failed'])
export type JobState = z.infer<typeof JobState>

/** Which worker lane a job runs on. GPU lane is the serialized bottleneck. */
export const WorkerClass = z.enum(['cpu', 'gpu'])
export type WorkerClass = z.infer<typeof WorkerClass>

export const Asset = z.object({
  id: z.string(),
  contentHash: z.string(),
  originalFilename: z.string(),
  bytes: z.number().int().nonnegative(),
  status: AssetStatus,
  ffprobe: z.unknown().nullable(),
  storageUri: z.string().nullable(),
  coverSegmentId: z.string().nullable(),
  segmentCount: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  error: z.string().nullable(),
})
export type Asset = z.infer<typeof Asset>

export const Master = z.object({
  id: z.string(),
  assetId: z.string(),
  storageUri: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number(),
  durationMs: z.number().int(),
  codec: z.string(),
  createdAt: z.number().int(),
})
export type Master = z.infer<typeof Master>

export const Segment = z.object({
  id: z.string(),
  masterId: z.string(),
  assetId: z.string(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  sceneScore: z.number().nullable(),
  hasThumbnail: z.boolean(),
  createdAt: z.number().int(),
})
export type Segment = z.infer<typeof Segment>

export const SegTag = z.object({
  key: z.string(),
  value: z.string(),
  confidence: z.number(),
  source: z.string(),
})
export type SegTag = z.infer<typeof SegTag>

export const SearchHit = z.object({
  segment: Segment,
  tags: z.array(SegTag),
  score: z.number().nullable(),
})
export type SearchHit = z.infer<typeof SearchHit>

export const VariantType = z.enum([
  'teaser',
  'compilation',
  'vertical',
  'gif',
  'paid',
  'cut',
  'promo',
])
export type VariantType = z.infer<typeof VariantType>

export const Aspect = z.enum(['vertical', 'square', 'widescreen'])
export type Aspect = z.infer<typeof Aspect>

export const RenderState = z.enum(['queued', 'rendering', 'ready', 'failed'])
export type RenderState = z.infer<typeof RenderState>

export const Variant = z.object({
  id: z.string(),
  type: VariantType,
  aspect: Aspect,
  sourceSegmentIds: z.array(z.string()),
  storageUri: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  renderState: RenderState,
  renderError: z.string().nullable(),
  requiresReview: z.boolean(),
  reviewState: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type Variant = z.infer<typeof Variant>

export const MaskRegion = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  startSec: z.number().optional(),
  endSec: z.number().optional(),
  cls: z.string().optional(),
})
export type MaskRegion = z.infer<typeof MaskRegion>

export const ReviewInfo = z.object({
  variantId: z.string(),
  reason: z.string(),
  verdict: z.string(),
  masks: z.array(MaskRegion),
  detectorAvailable: z.boolean(),
})
export type ReviewInfo = z.infer<typeof ReviewInfo>

export const SectionTag = z.object({
  value: z.string(),
  source: z.string(), // 'manual' | 'ai'
  confidence: z.number().nullable(),
})
export type SectionTag = z.infer<typeof SectionTag>

export const Section = z.object({
  id: z.string(),
  masterId: z.string(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  label: z.string().nullable(),
  favorite: z.boolean(),
  source: z.string(), // 'scene' (seeded) | 'manual'
  tags: z.array(SectionTag),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type Section = z.infer<typeof Section>

/**
 * EDL (Edit Decision List) — the Builder's output and the atomic thing a render job
 * consumes. An ordered list of clips on the main track; each clip references a Master
 * with an in/out window and a playback speed. Captions/overlays land in a later phase.
 */
export const EdlClip = z.object({
  sectionId: z.string().nullable(), // provenance; render uses master + in/out directly
  masterId: z.string(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  speed: z.number().positive().default(1),
  label: z.string().nullable().optional(),
})
export type EdlClip = z.infer<typeof EdlClip>

export const Edl = z.object({
  aspect: Aspect,
  clips: z.array(EdlClip).min(1),
  /** Burn auto-captions from the source transcript onto the rendered Cut. */
  captions: z.boolean().optional().default(false),
})
export type Edl = z.infer<typeof Edl>

export const Job = z.object({
  id: z.string(),
  type: JobType,
  targetType: z.string(),
  targetId: z.string(),
  state: JobState,
  workerClass: WorkerClass,
  inputHash: z.string(),
  modelVersion: z.string().nullable(),
  progress: z.number().min(0).max(1),
  attempts: z.number().int().nonnegative(),
  error: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type Job = z.infer<typeof Job>
