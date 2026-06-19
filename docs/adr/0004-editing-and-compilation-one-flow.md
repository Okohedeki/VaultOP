# 4. Editing and compilation are one flow — filter Sections by Tag

- Status: Accepted
- Date: 2026-06-19

## Context

The spec lists "Editing" (Stage 2, work one shoot) and "Compilations" (Stage 3, stitch
matching clips across the whole library) as separate stages. With **Sections** as the
assembly unit and **Tags** on every Section, both reduce to the same verb: *filter Sections
by Tag, then assemble.*

## Decision

The **Builder** pools Sections by Tag with a **scope toggle: this Master | whole library.**
"Edit this shoot" and "themed cross-library compilation" are the same operation at different
scope. There is **no separate compilation feature**.

## Consequences

- One surface and one render path serve both stages.
- "Show me every 'reveal' section across all my footage → assemble" is a first-class action.
- Cross-Master Cuts must normalize heterogeneous Masters (resolution/fps) at render — the
  existing `renderNormalizedClip` already does this.
