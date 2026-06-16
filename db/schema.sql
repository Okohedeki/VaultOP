-- VaultOP vault schema. The spine: a content-addressed, encrypted, tagged library.
-- Every derived artifact is a pure function of (segment, recipe, model_version),
-- so nothing here mutates source — downstream rows only reference upstream ones.
--
-- Phase 0 uses asset / master / job. The remaining tables (segment, tag, detection,
-- variant, review_task) are created now so later phases bolt on without migration.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Asset ──────────────────────────────────────────────────────────────────
-- The raw upload. Immutable. content_hash (sha256 of original bytes) dedups.
CREATE TABLE IF NOT EXISTS asset (
  id                TEXT PRIMARY KEY,
  content_hash      TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  bytes             INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'uploaded',
  ffprobe_json      TEXT,
  storage_uri       TEXT,                       -- encrypted blob of the original
  error             TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- ── Master ─────────────────────────────────────────────────────────────────
-- The normalized working transcode. One per asset. Everything downstream reads
-- the master, never the raw source codec.
CREATE TABLE IF NOT EXISTS master (
  id          TEXT PRIMARY KEY,
  asset_id    TEXT NOT NULL UNIQUE REFERENCES asset(id) ON DELETE CASCADE,
  storage_uri TEXT NOT NULL,                    -- encrypted blob of the master
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  fps         REAL NOT NULL,
  duration_ms INTEGER NOT NULL,
  codec       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- ── Segment ────────────────────────────────────────────────────────────────
-- A scene/shot slice of a master; the atomic library unit. Virtual by default
-- (start/end into the master). embedding filled in Phase 2 (CLIP vector).
CREATE TABLE IF NOT EXISTS segment (
  id           TEXT PRIMARY KEY,
  master_id    TEXT NOT NULL REFERENCES master(id) ON DELETE CASCADE,
  start_ms     INTEGER NOT NULL,
  end_ms       INTEGER NOT NULL,
  scene_score  REAL,
  keyframe_uri TEXT,
  embedding    BLOB,
  transcript_text TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_segment_master ON segment(master_id);

-- ── Tag ────────────────────────────────────────────────────────────────────
-- key/value/confidence/source. source ∈ {model,human,rule}. Confidence + source
-- on every tag is what powers the review queue and "human override beats model".
CREATE TABLE IF NOT EXISTS tag (
  id         TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES segment(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source     TEXT NOT NULL DEFAULT 'model',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tag_segment ON tag(segment_id);
CREATE INDEX IF NOT EXISTS idx_tag_kv ON tag(key, value);

-- ── Detection ──────────────────────────────────────────────────────────────
-- Accuracy-critical, spatial, per-keyframe-interval. Drives blur masks.
-- Separate from tag because tags are summary metadata; detections are regions.
-- model_version kept here so a detector upgrade re-runs without losing audit.
CREATE TABLE IF NOT EXISTS detection (
  id            TEXT PRIMARY KEY,
  segment_id    TEXT NOT NULL REFERENCES segment(id) ON DELETE CASCADE,
  time_ms       INTEGER NOT NULL,
  class         TEXT NOT NULL,                  -- genitalia|breast|face|tattoo|plate|screen
  bbox_json     TEXT NOT NULL,                  -- polygon/box
  confidence    REAL NOT NULL,
  track_id      TEXT,                           -- links the same region across frames
  model_version TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_detection_segment ON detection(segment_id);

-- ── Variant ────────────────────────────────────────────────────────────────
-- A rendered deliverable built from one+ segments via a recipe. fan_id /
-- watermark_payload are reserved (nullable) for the later leak-tracking loop.
CREATE TABLE IF NOT EXISTS variant (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,              -- teaser|compilation|vertical|gif|paid
  recipe_json       TEXT NOT NULL,
  source_segments   TEXT NOT NULL,             -- json array of segment ids
  storage_uri       TEXT,
  aspect            TEXT,
  platform_target   TEXT,
  duration_ms       INTEGER,
  render_state      TEXT NOT NULL DEFAULT 'queued', -- queued|rendering|ready|failed
  render_error      TEXT,
  requires_review   INTEGER NOT NULL DEFAULT 0,
  review_state      TEXT NOT NULL DEFAULT 'none', -- none|pending|approved|rejected
  fan_id            TEXT,                        -- reserved: leak-tracking loop
  watermark_payload TEXT,                        -- reserved: leak-tracking loop
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- ── ReviewTask ─────────────────────────────────────────────────────────────
-- The human gate. Append-only. A platform-bound variant cannot reach `ready`
-- without verdict='approved'. Snapshot + model_version give an audit trail.
CREATE TABLE IF NOT EXISTS review_task (
  id                  TEXT PRIMARY KEY,
  variant_id          TEXT NOT NULL REFERENCES variant(id) ON DELETE CASCADE,
  reason              TEXT NOT NULL,            -- low_confidence|detector_disagreement|new_model_version|sampled
  detections_snapshot TEXT NOT NULL,
  mask_overrides      TEXT,                     -- human-painted regions
  verdict             TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected
  reviewer            TEXT,
  created_at          INTEGER NOT NULL,
  decided_at          INTEGER
);
CREATE INDEX IF NOT EXISTS idx_review_variant ON review_task(variant_id);

-- ── Job ────────────────────────────────────────────────────────────────────
-- Orchestration record. input_hash = hash(target + recipe + model_version) gives
-- idempotency and result caching: re-running unchanged inputs is a cache hit.
CREATE TABLE IF NOT EXISTS job (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  target_type   TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'queued',
  worker_class  TEXT NOT NULL DEFAULT 'cpu',
  input_hash    TEXT NOT NULL,
  model_version TEXT,
  progress      REAL NOT NULL DEFAULT 0,
  attempts      INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(input_hash)
);
CREATE INDEX IF NOT EXISTS idx_job_state ON job(state, worker_class);
