# 5. The editor is the primary Cut-maker; one-click becomes a draft

- Status: Accepted
- Date: 2026-06-19

## Context

The shipped build makes Cuts via one-click "teaser" and "make all promos," which auto-pick
the first ~30s — usually *not* the sellable part. The creator wants real, hands-on editing.
But fully automatic assembly is still a useful *starting point*.

## Decision

End-to-end pipeline:
**Vault → Tagger (tag Sections) → Builder (assemble Cut) → Make Promos (reframe + blur per
Platform) → blur gate → hand-off.**

The editor is the primary way to make a Cut. The one-click teaser/fan-out is **demoted to a
"quick draft"**: it auto-picks ⭐/top Sections and opens them **pre-placed in the Builder**
to refine — it never produces a final artifact on its own.

The shipped fan-out, blur gate, and watermark stay as-is, now operating on editor-made Cuts.

## Consequences

- "Agentic make-a-teaser" still exists, but lands the creator *in the editor*, not at a
  finished file.
- `createTeaser` / `createFanout` change from "render a Variant" to "seed the Builder."
- "Make Promos" becomes an explicit step on a finished Cut (one Cut → many platform Promos).
