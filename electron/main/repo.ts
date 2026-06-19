// Typed data access for the vault. Maps snake_case rows ↔ camelCase domain types
// and enforces the Asset status state machine — illegal transitions throw, so a
// later phase can never code a forbidden jump (e.g. uploaded → ready).

import { randomUUID } from 'node:crypto'
import type { Db } from './db'
import {
  ASSET_TRANSITIONS,
  type Asset,
  type AssetStatus,
  type Job,
  type JobState,
  type JobType,
  type Aspect,
  type MaskRegion,
  type Master,
  type RenderState,
  type SearchHit,
  type SegTag,
  type Segment,
  type Section,
  type SectionTag,
  type Variant,
  type VariantType,
  type WorkerClass,
} from '@shared/domain'
import { bufferToEmbedding, cosine } from './analyzer'

interface AssetRow {
  id: string
  content_hash: string
  original_filename: string
  bytes: number
  status: string
  ffprobe_json: string | null
  storage_uri: string | null
  error: string | null
  created_at: number
  updated_at: number
}

interface JobRow {
  id: string
  type: string
  target_type: string
  target_id: string
  state: string
  worker_class: string
  input_hash: string
  model_version: string | null
  progress: number
  attempts: number
  error: string | null
  created_at: number
  updated_at: number
}

function mapAsset(
  r: AssetRow & { cover_segment_id?: string | null; segment_count?: number },
): Asset {
  return {
    id: r.id,
    contentHash: r.content_hash,
    originalFilename: r.original_filename,
    bytes: r.bytes,
    status: r.status as AssetStatus,
    ffprobe: r.ffprobe_json ? JSON.parse(r.ffprobe_json) : null,
    storageUri: r.storage_uri,
    coverSegmentId: r.cover_segment_id ?? null,
    segmentCount: r.segment_count ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    error: r.error,
  }
}

function mapJob(r: JobRow): Job {
  return {
    id: r.id,
    type: r.type as JobType,
    targetType: r.target_type,
    targetId: r.target_id,
    state: r.state as JobState,
    workerClass: r.worker_class as WorkerClass,
    inputHash: r.input_hash,
    modelVersion: r.model_version,
    progress: r.progress,
    attempts: r.attempts,
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapVariant(r: Record<string, unknown>): Variant {
  return {
    id: r.id as string,
    type: r.type as VariantType,
    aspect: (r.aspect as Aspect) ?? 'widescreen',
    sourceSegmentIds: JSON.parse((r.source_segments as string) ?? '[]') as string[],
    storageUri: (r.storage_uri as string | null) ?? null,
    durationMs: (r.duration_ms as number | null) ?? null,
    renderState: (r.render_state as RenderState) ?? 'queued',
    renderError: (r.render_error as string | null) ?? null,
    requiresReview: Boolean(r.requires_review),
    reviewState: (r.review_state as string) ?? 'none',
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  }
}

export class Repo {
  constructor(private readonly db: Db) {}

  private now(): number {
    return Date.now()
  }

  // ── Assets ────────────────────────────────────────────────────────────────

  findAssetByHash(hash: string): Asset | null {
    const r = this.db.prepare('SELECT * FROM asset WHERE content_hash = ?').get(hash) as
      | AssetRow
      | undefined
    return r ? mapAsset(r) : null
  }

  createAsset(input: { contentHash: string; originalFilename: string; bytes: number }): Asset {
    const id = randomUUID()
    const t = this.now()
    this.db
      .prepare(
        `INSERT INTO asset (id, content_hash, original_filename, bytes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'uploaded', ?, ?)`,
      )
      .run(id, input.contentHash, input.originalFilename, input.bytes, t, t)
    return this.getAsset(id)!
  }

  getAsset(id: string): Asset | null {
    const r = this.db.prepare('SELECT * FROM asset WHERE id = ?').get(id) as AssetRow | undefined
    return r ? mapAsset(r) : null
  }

  listAssets(): Asset[] {
    // Include each clip's cover (its first segment that has a thumbnail) so the
    // vault renders as a visual grid, not a list of filenames.
    const rows = this.db
      .prepare(
        `SELECT a.*, (
           SELECT s.id FROM segment s JOIN master m ON m.id = s.master_id
           WHERE m.asset_id = a.id AND s.keyframe_uri IS NOT NULL
           ORDER BY s.start_ms ASC LIMIT 1
         ) AS cover_segment_id,
         (
           SELECT COUNT(*) FROM segment s JOIN master m ON m.id = s.master_id
           WHERE m.asset_id = a.id
         ) AS segment_count
         FROM asset a ORDER BY a.created_at DESC`,
      )
      .all() as Array<AssetRow & { cover_segment_id: string | null; segment_count: number }>
    return rows.map(mapAsset)
  }

  /** Move an asset to a new status, rejecting illegal transitions. */
  setAssetStatus(id: string, next: AssetStatus, error?: string | null): Asset {
    const current = this.getAsset(id)
    if (!current) throw new Error(`asset ${id} not found`)
    const allowed = ASSET_TRANSITIONS[current.status]
    if (current.status !== next && !allowed.includes(next)) {
      throw new Error(`illegal asset transition ${current.status} → ${next}`)
    }
    this.db
      .prepare('UPDATE asset SET status = ?, error = ?, updated_at = ? WHERE id = ?')
      .run(next, error ?? null, this.now(), id)
    return this.getAsset(id)!
  }

  setAssetStorageUri(id: string, uri: string): void {
    this.db
      .prepare('UPDATE asset SET storage_uri = ?, updated_at = ? WHERE id = ?')
      .run(uri, this.now(), id)
  }

  setAssetFfprobe(id: string, ffprobe: unknown): void {
    this.db
      .prepare('UPDATE asset SET ffprobe_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(ffprobe), this.now(), id)
  }

  // ── Masters ───────────────────────────────────────────────────────────────

  createMaster(m: Omit<Master, 'id' | 'createdAt'>): Master {
    const id = randomUUID()
    const t = this.now()
    this.db
      .prepare(
        `INSERT INTO master (id, asset_id, storage_uri, width, height, fps, duration_ms, codec, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, m.assetId, m.storageUri, m.width, m.height, m.fps, m.durationMs, m.codec, t)
    return { id, createdAt: t, ...m }
  }

  getMaster(id: string): Master | null {
    const r = this.db.prepare('SELECT * FROM master WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return r ? this.mapMaster(r) : null
  }

  getMasterByAsset(assetId: string): Master | null {
    const r = this.db.prepare('SELECT * FROM master WHERE asset_id = ?').get(assetId) as
      | Record<string, unknown>
      | undefined
    return r ? this.mapMaster(r) : null
  }

  private mapMaster(r: Record<string, unknown>): Master {
    return {
      id: r.id as string,
      assetId: r.asset_id as string,
      storageUri: r.storage_uri as string,
      width: r.width as number,
      height: r.height as number,
      fps: r.fps as number,
      durationMs: r.duration_ms as number,
      codec: r.codec as string,
      createdAt: r.created_at as number,
    }
  }

  // ── Segments ──────────────────────────────────────────────────────────────

  createSegment(input: {
    masterId: string
    startMs: number
    endMs: number
    sceneScore?: number | null
  }): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO segment (id, master_id, start_ms, end_ms, scene_score, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.masterId, input.startMs, input.endMs, input.sceneScore ?? null, this.now())
    return id
  }

  setSegmentThumbnail(id: string, keyframeUri: string): void {
    this.db.prepare('UPDATE segment SET keyframe_uri = ? WHERE id = ?').run(keyframeUri, id)
  }

  getSegmentThumbnailUri(id: string): string | null {
    const r = this.db.prepare('SELECT keyframe_uri FROM segment WHERE id = ?').get(id) as
      | { keyframe_uri: string | null }
      | undefined
    return r?.keyframe_uri ?? null
  }

  countSegmentsByMaster(masterId: string): number {
    const r = this.db
      .prepare('SELECT COUNT(*) AS n FROM segment WHERE master_id = ?')
      .get(masterId) as { n: number }
    return r.n
  }

  listSegmentsByAsset(assetId: string): Segment[] {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.master_id, m.asset_id, s.start_ms, s.end_ms, s.scene_score,
                s.keyframe_uri, s.created_at
           FROM segment s JOIN master m ON m.id = s.master_id
          WHERE m.asset_id = ?
          ORDER BY s.start_ms ASC`,
      )
      .all(assetId) as Array<{
      id: string
      master_id: string
      asset_id: string
      start_ms: number
      end_ms: number
      scene_score: number | null
      keyframe_uri: string | null
      created_at: number
    }>
    return rows.map((r) => ({
      id: r.id,
      masterId: r.master_id,
      assetId: r.asset_id,
      startMs: r.start_ms,
      endMs: r.end_ms,
      sceneScore: r.scene_score,
      hasThumbnail: r.keyframe_uri != null,
      createdAt: r.created_at,
    }))
  }

  // ── Sections (creator-defined tagged ranges — the assembly unit) ───────────

  /** Seed Sections from the auto Scenes on first open (idempotent per Master). */
  ensureSectionsForMaster(masterId: string): void {
    const existing = this.db
      .prepare('SELECT COUNT(*) AS n FROM section WHERE master_id = ?')
      .get(masterId) as { n: number }
    if (existing.n > 0) return
    const scenes = this.db
      .prepare('SELECT start_ms, end_ms FROM segment WHERE master_id = ? ORDER BY start_ms')
      .all(masterId) as Array<{ start_ms: number; end_ms: number }>
    const t = this.now()
    const insert = this.db.prepare(
      `INSERT INTO section (id, master_id, start_ms, end_ms, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'scene', ?, ?)`,
    )
    const seed = this.db.transaction(() => {
      for (const s of scenes) insert.run(randomUUID(), masterId, s.start_ms, s.end_ms, t, t)
    })
    seed()
  }

  createSection(input: {
    masterId: string
    startMs: number
    endMs: number
    label?: string | null
  }): Section {
    const id = randomUUID()
    const t = this.now()
    this.db
      .prepare(
        `INSERT INTO section (id, master_id, start_ms, end_ms, label, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`,
      )
      .run(id, input.masterId, input.startMs, input.endMs, input.label ?? null, t, t)
    return this.getSection(id)!
  }

  updateSection(
    id: string,
    patch: { startMs?: number; endMs?: number; label?: string | null; favorite?: boolean },
  ): Section | null {
    const cur = this.getSection(id)
    if (!cur) return null
    this.db
      .prepare(
        'UPDATE section SET start_ms = ?, end_ms = ?, label = ?, favorite = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        patch.startMs ?? cur.startMs,
        patch.endMs ?? cur.endMs,
        patch.label !== undefined ? patch.label : cur.label,
        (patch.favorite ?? cur.favorite) ? 1 : 0,
        this.now(),
        id,
      )
    return this.getSection(id)
  }

  deleteSection(id: string): void {
    this.db.prepare('DELETE FROM section WHERE id = ?').run(id)
  }

  addSectionTag(sectionId: string, value: string, source = 'manual', confidence?: number): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO section_tag (id, section_id, value, source, confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), sectionId, value.trim().toLowerCase(), source, confidence ?? null, this.now())
  }

  removeSectionTag(sectionId: string, value: string): void {
    this.db
      .prepare('DELETE FROM section_tag WHERE section_id = ? AND value = ?')
      .run(sectionId, value.trim().toLowerCase())
  }

  getSection(id: string): Section | null {
    const r = this.db.prepare('SELECT * FROM section WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return r ? this.mapSection(r) : null
  }

  listSectionsByMaster(masterId: string): Section[] {
    const rows = this.db
      .prepare('SELECT * FROM section WHERE master_id = ? ORDER BY start_ms ASC')
      .all(masterId) as Array<Record<string, unknown>>
    return rows.map((r) => this.mapSection(r))
  }

  /** Builder filter: Sections carrying a tag value, scoped to one Master or all. */
  sectionsByTag(value: string, masterId: string | null): Section[] {
    const v = value.trim().toLowerCase()
    const rows = (
      masterId
        ? this.db
            .prepare(
              `SELECT s.* FROM section s JOIN section_tag t ON t.section_id = s.id
               WHERE t.value = ? AND s.master_id = ? ORDER BY s.start_ms`,
            )
            .all(v, masterId)
        : this.db
            .prepare(
              `SELECT s.* FROM section s JOIN section_tag t ON t.section_id = s.id
               WHERE t.value = ? ORDER BY s.created_at`,
            )
            .all(v)
    ) as Array<Record<string, unknown>>
    return rows.map((r) => this.mapSection(r))
  }

  private mapSection(r: Record<string, unknown>): Section {
    const tags = this.db
      .prepare('SELECT value, source, confidence FROM section_tag WHERE section_id = ? ORDER BY value')
      .all(r.id as string) as SectionTag[]
    return {
      id: r.id as string,
      masterId: r.master_id as string,
      startMs: r.start_ms as number,
      endMs: r.end_ms as number,
      label: (r.label as string | null) ?? null,
      favorite: Boolean(r.favorite),
      source: r.source as string,
      tags,
      createdAt: r.created_at as number,
      updatedAt: r.updated_at as number,
    }
  }

  // ── Tags / embeddings / search ────────────────────────────────────────────

  addTag(input: {
    segmentId: string
    key: string
    value: string
    confidence?: number
    source?: string
  }): void {
    this.db
      .prepare(
        `INSERT INTO tag (id, segment_id, key, value, confidence, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.segmentId,
        input.key,
        input.value,
        input.confidence ?? 1,
        input.source ?? 'model',
        this.now(),
      )
  }

  setSegmentEmbedding(segmentId: string, embedding: Buffer): void {
    this.db.prepare('UPDATE segment SET embedding = ? WHERE id = ?').run(embedding, segmentId)
  }

  setSegmentTranscript(segmentId: string, text: string): void {
    this.db.prepare('UPDATE segment SET transcript_text = ? WHERE id = ?').run(text, segmentId)
  }

  getSegmentTags(segmentId: string): SegTag[] {
    return this.db
      .prepare('SELECT key, value, confidence, source FROM tag WHERE segment_id = ? ORDER BY key')
      .all(segmentId) as SegTag[]
  }

  /** Text search across tag keys/values and transcripts. Ranks by terms matched. */
  searchSegments(query: string): SearchHit[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []

    const segs = this.allSegmentRows()
    const tagsBySeg = this.tagsBySegment()

    const hits: SearchHit[] = []
    for (const s of segs) {
      const tags = tagsBySeg.get(s.id) ?? []
      const haystack = (
        tags.map((t) => `${t.key} ${t.value}`).join(' ') +
        ' ' +
        (s.transcriptText ?? '')
      ).toLowerCase()
      const matched = terms.filter((t) => haystack.includes(t)).length
      if (matched > 0) {
        hits.push({ segment: s.segment, tags, score: matched / terms.length })
      }
    }
    hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.segment.startMs - b.segment.startMs)
    return hits.slice(0, 200)
  }

  /** Visual similarity search via cosine over stored embeddings. */
  similarSegments(segmentId: string, limit = 60): SearchHit[] {
    const target = this.getSegmentEmbedding(segmentId)
    if (!target) return []
    const tagsBySeg = this.tagsBySegment()
    const scored: SearchHit[] = []
    for (const s of this.allSegmentRows()) {
      if (s.id === segmentId || !s.embedding) continue
      const score = cosine(target, bufferToEmbedding(s.embedding))
      scored.push({ segment: s.segment, tags: tagsBySeg.get(s.id) ?? [], score })
    }
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return scored.slice(0, limit)
  }

  private getSegmentEmbedding(segmentId: string): Float32Array | null {
    const r = this.db.prepare('SELECT embedding FROM segment WHERE id = ?').get(segmentId) as
      | { embedding: Buffer | null }
      | undefined
    return r?.embedding ? bufferToEmbedding(r.embedding) : null
  }

  private allSegmentRows(): Array<{
    id: string
    segment: Segment
    embedding: Buffer | null
    transcriptText: string | null
  }> {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.master_id, m.asset_id, s.start_ms, s.end_ms, s.scene_score,
                s.keyframe_uri, s.embedding, s.transcript_text, s.created_at
           FROM segment s JOIN master m ON m.id = s.master_id`,
      )
      .all() as Array<{
      id: string
      master_id: string
      asset_id: string
      start_ms: number
      end_ms: number
      scene_score: number | null
      keyframe_uri: string | null
      embedding: Buffer | null
      transcript_text: string | null
      created_at: number
    }>
    return rows.map((r) => ({
      id: r.id,
      embedding: r.embedding,
      transcriptText: r.transcript_text,
      segment: {
        id: r.id,
        masterId: r.master_id,
        assetId: r.asset_id,
        startMs: r.start_ms,
        endMs: r.end_ms,
        sceneScore: r.scene_score,
        hasThumbnail: r.keyframe_uri != null,
        createdAt: r.created_at,
      },
    }))
  }

  private tagsBySegment(): Map<string, SegTag[]> {
    const rows = this.db
      .prepare('SELECT segment_id, key, value, confidence, source FROM tag')
      .all() as Array<{ segment_id: string } & SegTag>
    const map = new Map<string, SegTag[]>()
    for (const r of rows) {
      const list = map.get(r.segment_id) ?? []
      list.push({ key: r.key, value: r.value, confidence: r.confidence, source: r.source })
      map.set(r.segment_id, list)
    }
    return map
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  createVariant(input: {
    type: VariantType
    aspect: Aspect
    recipeJson: string
    sourceSegmentIds: string[]
  }): string {
    const id = randomUUID()
    const t = this.now()
    this.db
      .prepare(
        `INSERT INTO variant (id, type, recipe_json, source_segments, aspect, render_state, requires_review, review_state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'queued', 0, 'none', ?, ?)`,
      )
      .run(
        id,
        input.type,
        input.recipeJson,
        JSON.stringify(input.sourceSegmentIds),
        input.aspect,
        t,
        t,
      )
    return id
  }

  setVariantState(id: string, state: RenderState, error?: string | null): void {
    this.db
      .prepare('UPDATE variant SET render_state = ?, render_error = ?, updated_at = ? WHERE id = ?')
      .run(state, error ?? null, this.now(), id)
  }

  setVariantResult(id: string, storageUri: string, durationMs: number): void {
    this.db
      .prepare(
        `UPDATE variant SET storage_uri = ?, duration_ms = ?, render_state = 'ready', updated_at = ? WHERE id = ?`,
      )
      .run(storageUri, durationMs, this.now(), id)
  }

  getVariantRecipe(id: string): Record<string, unknown> {
    const r = this.db.prepare('SELECT recipe_json FROM variant WHERE id = ?').get(id) as
      | { recipe_json: string }
      | undefined
    try {
      return r ? (JSON.parse(r.recipe_json) as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }

  getVariant(id: string): Variant | null {
    const r = this.db.prepare('SELECT * FROM variant WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return r ? mapVariant(r) : null
  }

  listVariants(): Variant[] {
    const rows = this.db
      .prepare('SELECT * FROM variant ORDER BY created_at DESC LIMIT 200')
      .all() as Array<Record<string, unknown>>
    return rows.map(mapVariant)
  }

  /** Resolve segment ids to ordered render inputs (master blob + in/out points). */
  resolveSegmentsForRender(
    ids: string[],
  ): Array<{ segmentId: string; masterHash: string; startMs: number; endMs: number }> {
    const out: Array<{ segmentId: string; masterHash: string; startMs: number; endMs: number }> = []
    const stmt = this.db.prepare(
      `SELECT s.start_ms, s.end_ms, m.storage_uri
         FROM segment s JOIN master m ON m.id = s.master_id WHERE s.id = ?`,
    )
    for (const id of ids) {
      const r = stmt.get(id) as
        | { start_ms: number; end_ms: number; storage_uri: string }
        | undefined
      if (!r) continue
      out.push({
        segmentId: id,
        masterHash: r.storage_uri.replace('blobs/', ''),
        startMs: r.start_ms,
        endMs: r.end_ms,
      })
    }
    return out
  }

  // ── Review gate ───────────────────────────────────────────────────────────

  /** Mark a variant as needing human verification and open an append-only task. */
  openReview(variantId: string, reason: string): void {
    const t = this.now()
    this.db
      .prepare(
        `UPDATE variant SET requires_review = 1, review_state = 'pending', updated_at = ? WHERE id = ?`,
      )
      .run(t, variantId)
    this.db
      .prepare(
        `INSERT INTO review_task (id, variant_id, reason, detections_snapshot, mask_overrides, verdict, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(randomUUID(), variantId, reason, '[]', '[]', t)
  }

  getReview(variantId: string): { reason: string; verdict: string; masks: MaskRegion[] } | null {
    const r = this.db
      .prepare(
        `SELECT reason, verdict, mask_overrides FROM review_task WHERE variant_id = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(variantId) as
      | { reason: string; verdict: string; mask_overrides: string | null }
      | undefined
    if (!r) return null
    return {
      reason: r.reason,
      verdict: r.verdict,
      masks: JSON.parse(r.mask_overrides ?? '[]') as MaskRegion[],
    }
  }

  setReviewMasks(variantId: string, masks: MaskRegion[]): void {
    this.db
      .prepare(
        `UPDATE review_task SET mask_overrides = ? WHERE id =
           (SELECT id FROM review_task WHERE variant_id = ? ORDER BY created_at DESC LIMIT 1)`,
      )
      .run(JSON.stringify(masks), variantId)
  }

  /** Record the human verdict on both the task and the variant. */
  setReviewVerdict(variantId: string, verdict: 'approved' | 'rejected', reviewer = 'creator'): void {
    const t = this.now()
    this.db
      .prepare(
        `UPDATE review_task SET verdict = ?, reviewer = ?, decided_at = ? WHERE id =
           (SELECT id FROM review_task WHERE variant_id = ? ORDER BY created_at DESC LIMIT 1)`,
      )
      .run(verdict, reviewer, t, variantId)
    this.db
      .prepare('UPDATE variant SET review_state = ?, updated_at = ? WHERE id = ?')
      .run(verdict, t, variantId)
  }

  replaceVariantBlob(variantId: string, storageUri: string, durationMs: number): void {
    this.db
      .prepare('UPDATE variant SET storage_uri = ?, duration_ms = ?, updated_at = ? WHERE id = ?')
      .run(storageUri, durationMs, this.now(), variantId)
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────

  /** Insert a job, or return the existing one with the same input_hash (cache). */
  enqueueJob(input: {
    type: JobType
    targetType: string
    targetId: string
    workerClass: WorkerClass
    inputHash: string
    modelVersion?: string | null
  }): Job {
    const existing = this.db
      .prepare('SELECT * FROM job WHERE input_hash = ?')
      .get(input.inputHash) as JobRow | undefined
    if (existing) return mapJob(existing)

    const id = randomUUID()
    const t = this.now()
    this.db
      .prepare(
        `INSERT INTO job (id, type, target_type, target_id, state, worker_class, input_hash, model_version, progress, attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, 0, 0, ?, ?)`,
      )
      .run(
        id,
        input.type,
        input.targetType,
        input.targetId,
        input.workerClass,
        input.inputHash,
        input.modelVersion ?? null,
        t,
        t,
      )
    return this.getJob(id)!
  }

  getJob(id: string): Job | null {
    const r = this.db.prepare('SELECT * FROM job WHERE id = ?').get(id) as JobRow | undefined
    return r ? mapJob(r) : null
  }

  /** Claim the oldest queued job for a worker lane (atomic). */
  claimNextJob(workerClass: WorkerClass): Job | null {
    const claim = this.db.transaction((): Job | null => {
      const r = this.db
        .prepare(
          `SELECT * FROM job WHERE state = 'queued' AND worker_class = ? ORDER BY created_at ASC LIMIT 1`,
        )
        .get(workerClass) as JobRow | undefined
      if (!r) return null
      this.db
        .prepare(
          `UPDATE job SET state = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?`,
        )
        .run(this.now(), r.id)
      return this.getJob(r.id)
    })
    return claim()
  }

  setJobProgress(id: string, progress: number): void {
    this.db
      .prepare('UPDATE job SET progress = ?, updated_at = ? WHERE id = ?')
      .run(Math.max(0, Math.min(1, progress)), this.now(), id)
  }

  finishJob(id: string, state: Extract<JobState, 'done' | 'failed'>, error?: string | null): void {
    this.db
      .prepare('UPDATE job SET state = ?, error = ?, progress = ?, updated_at = ? WHERE id = ?')
      .run(state, error ?? null, state === 'done' ? 1 : 0, this.now(), id)
  }

  /** Return a job to the queue for another attempt, keeping the error visible. */
  requeueJob(id: string, error: string): void {
    this.db
      .prepare(`UPDATE job SET state = 'queued', error = ?, progress = 0, updated_at = ? WHERE id = ?`)
      .run(error, this.now(), id)
  }

  listJobs(activeOnly = false): Job[] {
    const sql = activeOnly
      ? `SELECT * FROM job WHERE state IN ('queued','running') ORDER BY created_at DESC`
      : 'SELECT * FROM job ORDER BY created_at DESC LIMIT 200'
    return (this.db.prepare(sql).all() as JobRow[]).map(mapJob)
  }
}
