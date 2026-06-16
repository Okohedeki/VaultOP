// The single typed IPC contract. Every channel is declared here once with a zod
// schema for its request and response. Main validates requests; the renderer gets
// full type inference. If the contract drifts, the build breaks — by design.

import { z } from 'zod'
import { Aspect, Asset, Job, MaskRegion, ReviewInfo, SearchHit, Segment, Variant } from './domain'

/** invoke channels: renderer → main → response */
export const ipcContract = {
  'ingest:addFiles': {
    request: z.object({ paths: z.array(z.string()).min(1) }),
    response: z.object({
      added: z.array(z.object({ assetId: z.string(), filename: z.string() })),
      duplicates: z.array(z.object({ assetId: z.string(), filename: z.string() })),
    }),
  },
  'assets:list': {
    request: z.object({}),
    response: z.object({ assets: z.array(Asset) }),
  },
  'assets:get': {
    request: z.object({ id: z.string() }),
    response: z.object({ asset: Asset.nullable() }),
  },
  'jobs:list': {
    request: z.object({ active: z.boolean().optional() }),
    response: z.object({ jobs: z.array(Job) }),
  },
  'segments:listByAsset': {
    request: z.object({ assetId: z.string() }),
    response: z.object({ segments: z.array(Segment) }),
  },
  'thumb:get': {
    request: z.object({ segmentId: z.string() }),
    response: z.object({ dataUrl: z.string().nullable() }),
  },
  'search:query': {
    request: z.object({ query: z.string() }),
    response: z.object({ hits: z.array(SearchHit) }),
  },
  'segments:similar': {
    request: z.object({ segmentId: z.string() }),
    response: z.object({ hits: z.array(SearchHit) }),
  },
  'segments:tags': {
    request: z.object({ segmentId: z.string() }),
    response: z.object({ tags: z.array(z.object({ key: z.string(), value: z.string() })) }),
  },
  'assembly:teaser': {
    request: z.object({ assetId: z.string() }),
    response: z.object({ variantId: z.string() }),
  },
  'assembly:compilation': {
    request: z.object({ segmentIds: z.array(z.string()).min(1), aspect: Aspect }),
    response: z.object({ variantId: z.string() }),
  },
  'variants:list': {
    request: z.object({}),
    response: z.object({ variants: z.array(Variant) }),
  },
  'variant:export': {
    request: z.object({ variantId: z.string() }),
    response: z.object({ path: z.string().nullable() }),
  },
  'review:get': {
    request: z.object({ variantId: z.string() }),
    response: z.object({ info: ReviewInfo.nullable(), frameDataUrl: z.string().nullable() }),
  },
  'review:setMasks': {
    request: z.object({ variantId: z.string(), masks: z.array(MaskRegion) }),
    response: z.object({ ok: z.boolean() }),
  },
  'review:approve': {
    request: z.object({ variantId: z.string() }),
    response: z.object({ ok: z.boolean() }),
  },
  'review:reject': {
    request: z.object({ variantId: z.string() }),
    response: z.object({ ok: z.boolean() }),
  },
} as const

export type IpcContract = typeof ipcContract
export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>

/** Push events: main → renderer (one-way, also zod-validated before send). */
export const eventContract = {
  'assets:changed': z.object({ assets: z.array(Asset) }),
  'jobs:changed': z.object({ jobs: z.array(Job) }),
  'variants:changed': z.object({ variants: z.array(Variant) }),
} as const

export type EventContract = typeof eventContract
export type EventName = keyof EventContract
export type EventPayload<E extends EventName> = z.infer<EventContract[E]>

/** Shape exposed on window.vaultop by the preload bridge. */
export interface VaultopBridge {
  invoke<C extends IpcChannel>(channel: C, request: IpcRequest<C>): Promise<IpcResponse<C>>
  on<E extends EventName>(event: E, handler: (payload: EventPayload<E>) => void): () => void
  /** Open the native file picker and return chosen paths (empty if cancelled). */
  pickFiles(): Promise<string[]>
  /** Resolve the absolute path of a dropped File (Electron webUtils). */
  getPathForFile(file: unknown): string
}
