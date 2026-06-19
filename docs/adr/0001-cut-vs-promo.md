# 1. Cut and Promo are distinct artifacts

- Status: Accepted
- Date: 2026-06-19

## Context

"Teaser" was used for two unrelated things: a *short highlight cut* (Stage 2, "make a 30s
teaser") and a *blurred platform-safe version* (Stage 4/5, "blurred teaser per platform").
The shipped build fused them — `createTeaser` produced a 30s vertical clip **and** forced
it through the mandatory blur-review gate, as if every short clip is automatically a public
promo. That conflates editing with platform-safety.

## Decision

Split into two nouns:
- **Cut** — any rendered selection of Sections (highlight, compilation, full paid version).
  Pure editing output, no safety guarantee.
- **Promo** — a Cut made platform-safe (blurred + reframed for a Platform).

The mandatory blur-verification gate attaches to **Promo only**, never to a plain Cut.

## Consequences

- Editing (Stage 2), platform-safety (Stage 4), and fan-out (Stage 5) decouple cleanly:
  fan-out becomes "one Cut → many Promos."
- The paid/full Cut exports without the gate (it stays behind the paywall).
- The existing `variant` table is the storage parent of both; a Promo carries a
  platform target and the review state, a Cut does not.
