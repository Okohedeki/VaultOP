# 2. Manual tagged Sections are the assembly unit; auto-Scenes are seeds

- Status: Accepted
- Date: 2026-06-19

## Context

The original vision leaned on fully-automatic scene-split + auto-tags, with Cuts assembled
by querying the vault. In practice the creator wants **hands-on control** of what becomes a
clip: "the ability to tag sections and easily build out clips from it." Auto scene-cuts
rarely land exactly where a sellable moment starts/ends.

## Decision

- **Section** = a creator-defined, tagged time range (in/out + Tags) — **the unit Cuts are
  assembled from.**
- **Scene** = the machine's auto-detected shot boundary — demoted to a *seed*: when a Master
  is opened, Scenes pre-draw suggested Section boundaries so the creator isn't marking
  everything by hand. They keep/merge/retrim/relabel, and can draw Sections freehand.

## Consequences

- The editor is **editor-first**, not query-first. Auto-analysis accelerates, never decides.
- A new `section` model is required (distinct from the existing auto `segment`/Scene rows).
- Tag filtering operates over Sections, making "build a clip from tag X" the core verb.
