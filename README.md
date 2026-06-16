# VaultOP

Local-first, **MIT-licensed** media pipeline for content creators. **The vault is the
spine** — an analyzed, encrypted, content-addressed library; editing, compilations, and
blur are operations on what's in it. Content never leaves the machine, and everything
runs natively (no Python, no cloud).

> Status: **the MVP wedge is functional and verified end-to-end** — ingest → tagged,
> scene-split, searchable library → one-click teaser + cross-library compilation →
> mandatory human-verified blur gate → export. See the build plan at
> `~/.claude/plans/drop-comms-entirely-cosmic-spindle.md` and decisions in
> [docs/research.md](docs/research.md).

## What it does today

1. **Ingest** — drag-drop raw footage → content-hashed, **encrypted at rest** (envelope
   AES-256-GCM; master key in the OS keychain via Electron `safeStorage`), **transcoded**
   to a normalized H.264 master. Identical files **dedupe** by content hash.
2. **Library** — native ffmpeg **scene detection** splits each master into segments with
   encrypted thumbnails; the vault becomes scrubbable instead of a folder of `IMG_4821.mov`.
3. **Search & tags** — a fully-native analyzer (ffmpeg color-histogram embeddings +
   brightness/tone/length tags, **zero model downloads**) makes the vault text-searchable
   and supports **visual "find similar"**.
4. **Assembly** — one-click **30s vertical teaser** and **themed compilation** stitched
   across the whole library, rendered with ffmpeg.
5. **Blur gate** — teasers are platform-bound, so they enter a **mandatory, confidence-gated
   human review**: draw blur masks over a frame, approve → re-blurs and unlocks export;
   **export is blocked until approved**. This is the one judgment-heavy step, kept human.
6. **Hand-off** — export the finished cut for the creator to post.

All processing runs through a durable SQLite job queue with cpu/gpu lanes and a live
progress UI.

## Native ML upgrades (optional, all MIT/Apache)

The product is fully functional with **no model downloads**. Dropping in native ONNX
models upgrades the analysis without code changes (see [docs/research.md](docs/research.md)):
NudeNet (MIT) for explicit-region detection, OpenCLIP (MIT) for semantic tags, whisper.cpp
(MIT) for transcription, YOLOX/SCRFD (Apache/MIT) for people/faces — run via
`onnxruntime-node` (CoreML on macOS, DirectML on Windows) and whisper.cpp. The mandatory
human gate sits on top of detection regardless.

## Architecture

- **Electron** (Node main) + **React/TS** (Vite) renderer. `contextIsolation: true`,
  `nodeIntegration: false`; the renderer reaches main only through a typed,
  zod-validated `contextBridge` surface (`shared/ipc.ts`).
- **Main-process core** (`electron/main/*`, Electron-free except `index.ts` /
  `masterkey.ts`): `crypto` + `blobstore` (encryption boundary), `db` + `repo`
  (SQLite, state-machine-enforced status), `queue` (lanes + `input_hash`
  idempotency), `ffmpeg` + `transcode`, `ingest`.
- **Spine schema** (`db/schema.sql`): all 8 entities (asset, master, segment, tag,
  detection, variant, job, review_task) — later phases bolt on without migration.
- **ML** (later phases): a Python sidecar built per platform — CoreML on macOS,
  CUDA on Windows.

## Develop

```bash
npm install
npm run typecheck      # strict TS, main + renderer
npm test               # unit: state machine, idempotency, crypto round-trip + tamper
npm run smoke          # headless end-to-end: ingest → encrypt → transcode → ready → dedup

# Run the desktop app (rebuilds native modules for Electron's ABI first):
npm run rebuild:electron
npm run dev
```

> `npm install` builds `better-sqlite3` for plain Node (so `test`/`smoke` run).
> `npm run rebuild:electron` rebuilds it for Electron before `npm run dev`.

## Build installers (two separate downloads — no universal binary)

```bash
npm run dist:mac   # Apple Silicon .dmg  (CoreML + whisper.cpp Metal)
npm run dist:win   # NVIDIA NSIS         (CUDA + whisper.cpp CUDA)
```
