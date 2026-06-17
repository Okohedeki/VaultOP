# VaultOP

[![ci](https://github.com/Okohedeki/VaultOP/actions/workflows/ci.yml/badge.svg)](https://github.com/Okohedeki/VaultOP/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![release](https://img.shields.io/github/v/release/Okohedeki/VaultOP)](https://github.com/Okohedeki/VaultOP/releases/latest)

Local-first, **MIT-licensed** media pipeline for content creators. **The vault is the
spine** — an analyzed, encrypted, content-addressed library; editing, compilations, and
blur are operations on what's in it. Content never leaves the machine, and everything
runs natively (no Python, no cloud).

## Download

Grab an installer from the **[latest release](https://github.com/Okohedeki/VaultOP/releases/latest)**:

- **macOS (Apple Silicon)** — `.dmg`. The build is **ad-hoc signed but not notarized**
  (no paid Apple Developer ID yet), so on first launch macOS Gatekeeper will warn.
  Open it one of two ways:
  - **Drag VaultOP to Applications**, double-click once, then go to **System Settings →
    Privacy & Security → "Open Anyway"**; or
  - run **`xattr -cr /Applications/VaultOP.app`** in Terminal, then open it.
- **Windows** — NSIS `.exe` installer (unsigned; click **More info → Run anyway** on the
  SmartScreen prompt).

### Verify the build yourself
- `VaultOP --selftest` — runs the whole pipeline headless inside the packaged app, exits 0/1.
- `npm run uitest` — launches the real window, ingests a clip, makes a teaser, and
  screenshots each step (proof the GUI and every feature work, not just the core).

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

## For agents & automation (CLI + MCP)

VaultOP runs headlessly so **AI agents and scripts** can drive the whole pipeline against
the **same encrypted vault** as the GUI. Full reference: [AGENTS.md](AGENTS.md).

- **CLI** — `VaultOP --cli <command>`, JSON in/out (`bin/vaultop` wraps it):
  ```bash
  vaultop ingest ./shoot.mov        # → encrypts, scene-splits, tags; waits until ready
  vaultop search "bedroom short"    # → matching segments + tags
  vaultop teaser <assetId>          # → 30s vertical teaser (enters the review gate)
  vaultop export <variantId> out.mp4  # → blocked until reviewed + approved
  ```
- **MCP server** — `mcp/server.mjs` exposes 15 tools for MCP clients (Claude Desktop /
  Claude Code). See [mcp/README.md](mcp/README.md).

The **blur-review gate is enforced for agents too**: a platform-bound teaser cannot be
exported until a human/agent explicitly approves it — there is no bypass.

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
