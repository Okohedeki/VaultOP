# 3. Build a lean native editor; lift OpenCut Classic's MIT components (don't fork the app)

- Status: Accepted
- Date: 2026-06-19

## Context

VaultOP needs a built-in video editor at the "day-to-day OF creator" altitude — enough for
typical editing, not a Premiere/DaVinci competitor. [OpenCut](https://github.com/opencut-app/opencut)
is an MIT, 57k★ "open-source CapCut alternative" — the right altitude. But:

- OpenCut is **mid-rewrite**: the embeddable React/Next.js editor is now **OpenCut Classic
  (legacy)**; the new core is **Rust**, and the project is **not accepting external
  contributions** during the redesign.
- **Stack mismatch:** OpenCut = Next.js + ffmpeg.**wasm** (browser export). VaultOP =
  electron-vite/React + **native ffmpeg** against an **encrypted vault**.

Alternatives weighed: (a) fork OpenCut Classic wholesale, (b) build fully custom, (c) build
lean and lift OpenCut's MIT components.

## Decision

Choose (c): **build a lean native editor, selectively lifting OpenCut Classic's MIT timeline
components** (ruler, clip drag, trim handles). Wire it to VaultOP's Section model and render
through the existing native pipeline (`assembly.ts`) via an EDL — not OpenCut's wasm export.

**v1 feature set:** scrub+zoom, trim, split/razor, reorder, ripple-delete, **captions/text
overlay** (manual + auto from our transcripts), **one second track**, **per-clip speed**.
Deferred: transitions, >2 tracks, audio mixing/ducking.

## Consequences

- We don't inherit a legacy fork to maintain, nor the Next.js + wasm baggage.
- We own the timeline↔Section glue and the EDL→ffmpeg render (the real work).
- Any lifted OpenCut code keeps its MIT attribution (see `docs/research.md` / NOTICE).
