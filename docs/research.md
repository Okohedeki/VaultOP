# VaultOP — Research & Decisions

Grounding research for a **local-first, MIT-licensed, native-when-possible** media
pipeline. Captured 2026-06; informs the build plan at
`~/.claude/plans/drop-comms-entirely-cosmic-spindle.md`.

## How content-vault users actually work today

- **The official OnlyFans Vault** stores media organized by folders/categories/tags,
  with metadata fields creators care about: **content type** (solo / couple / themed),
  **mood**, **content length**, **season produced**, **theme/outfit/location**. It
  exists to avoid re-uploading the same content. → VaultOP's auto-tag dimensions map
  directly onto this vocabulary (setting, content type, length, who's-in-frame).
- **Third-party stacks** (CreatorHero, Fans-CRM, Supercreator) bolt on CRM, PPV
  automation, cross-platform scheduling, and **built-in watermarking** for anti-piracy.
  VaultOP is upstream of these: it *produces* the cuts they distribute.
- **The pain point is tagging.** Manual tagging runs **2–3 hours per hour of footage**;
  human tagging is incomplete/inconsistent; and crucially *"most creators don't tag —
  and most tools assume that you do."* Batch auto-tagging cuts that ~95%. AI editing
  agents already ingest raw → scene-detect → pick high-engagement clips → caption →
  format per platform. **This is exactly VaultOP's wedge** — and the analyzed, tagged,
  scene-split vault is what makes the rest queries instead of scrubbing.

**Implication:** the differentiator is not the editor — it's the *vault becoming
searchable/sliceable on ingest with zero manual tagging*, plus the human-verified blur
gate that the AI-agent tools don't take seriously.

## Native-when-possible ML stack (no Python sidecar)

Research confirmed the whole pipeline runs as **native Node bindings + native binaries**,
so we drop the planned Python sidecar entirely — a major packaging win:

| Capability | Native tool | Runtime | License |
|---|---|---|---|
| Scene/shot detection | ffmpeg `scdet` / `select=scene` filter (parse scores) | bundled ffmpeg binary | (ffmpeg, see below) |
| Thumbnails / cut / concat / reframe / blur | ffmpeg filters | bundled ffmpeg binary | (ffmpeg) |
| Transcription | whisper.cpp via `nodejs-whisper` / `whisper-node-addon` (prebuilt for mac/win, Electron-ready) | native N-API addon | **MIT**; ggml models **MIT** |
| Tagging + semantic embeddings | OpenCLIP ONNX via `onnxruntime-node` | native N-API | **MIT** (ORT); CLIP **MIT** |
| Explicit/NSFW region detection | **NudeNet** ONNX (18 region classes, bboxes) via `onnxruntime-node` | native N-API | **MIT** (verified on PyPI) |
| Person / face detection | **YOLOX** / **SCRFD** ONNX via `onnxruntime-node` | native N-API | **Apache-2.0 / MIT** (not AGPL Ultralytics) |
| Cross-frame tracking | IoU/ByteTrack-style tracker implemented in TS | pure TS | n/a |

**Execution providers (per build):**
- **macOS (Apple Silicon):** ONNX Runtime **CoreML** EP; whisper.cpp **Metal**.
- **Windows:** ONNX Runtime **DirectML** EP (any DX12 GPU — NVIDIA/AMD/Intel), *not* CUDA
  (onnxruntime-node ships prebuilt CUDA for Linux only). This removes the NVIDIA-only
  requirement; CPU fallback always available.

**Why this matters for the MIT goal:** every model and runtime above is MIT/Apache.
Inference-only use of the NudeNet/YOLOX **ONNX graphs** does not pull in the AGPL
Ultralytics training code, so the architecture stays clean even though some weights were
trained with a YOLOv8/X architecture.

## ffmpeg licensing (the one caveat)

`ffmpeg-static` distributes a **GPL** build (libx264, etc.). VaultOP invokes ffmpeg as a
**separate program over the CLI** (no linking), which is mere aggregation — acceptable as
long as we ship ffmpeg's license text and offer its source. **Clean-MIT path** for a
public release: switch to an **LGPL ffmpeg** build and encode with **hardware encoders**
(`h264_videotoolbox` on macOS, `h264_mf`/DirectX on Windows) or **openh264 (BSD)** instead
of GPL libx264 — which is also *more* native (hardware-accelerated). Tracked as ADR-0002.

## Net architecture changes from research

1. **Delete the Python sidecar** — all ML is native Node (`onnxruntime-node`) + native
   binaries (ffmpeg, whisper.cpp). Simpler installer, fewer runtimes, all permissive.
2. **Windows uses DirectML**, not CUDA. macOS uses CoreML.
3. **Person/face detection = YOLOX/SCRFD (Apache/MIT)**, never Ultralytics (AGPL).
4. **Scene detection via native ffmpeg `scdet`**, not PySceneDetect (drops a Python dep).
5. ffmpeg licensing path to a clean-MIT LGPL+hardware-encoder build is documented.

## Sources

- OnlyFans Vault & creator tooling: creatorhero.com, ofauditor.app, sozee.ai
- Tagging pain points: cyme.io, vidio.ai, enterprisetube.com
- NudeNet license/classes: pypi.org/project/nudenet
- onnxruntime-node EPs: github.com/microsoft/onnxruntime (js/node), onnxruntime.ai
- Permissive detection models: YOLOX (Apache-2.0), SCRFD
- whisper.cpp Node bindings: npm `nodejs-whisper`, `whisper-node-addon`
- ffmpeg licensing: ffmpeg.org/legal.html, ffmpeg-static issue #8
