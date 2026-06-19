# VaultOP — Context

The shared vocabulary of VaultOP, a local-first media pipeline for content creators where
the encrypted **vault** is the spine and everything else is an operation on what's in it.

## Language

### Vault & footage

**Master**:
The normalized, encrypted working transcode of one raw upload.
_Avoid_: video, file, source.

**Scene**:
An auto-detected shot boundary on a Master, used only to seed Section boundaries.
_Avoid_: segment, clip, cut.

**Section**:
A creator-defined, tagged time range on a Master — the unit Cuts are assembled from.
_Avoid_: clip, segment, scene.

**Tag**:
A label on a Section — a freeform word, the ⭐ favorite, or an AI auto-facet — in one
filterable space.
_Avoid_: category, keyword, label-type.

### Deliverables

**Cut**:
A rendered selection of Sections that carries no platform-safety guarantee.
_Avoid_: teaser, compilation, export.

**Promo**:
A Cut made platform-safe (blurred + reframed) for a specific Platform.
_Avoid_: teaser, blurred clip.

**Platform**:
A publish target with a preset of aspect, max length, and safety rules (TikTok, Instagram,
Reddit).
_Avoid_: channel, destination.

**Variant**:
The storage parent of a Cut or a Promo.
_Avoid_: render, output, artifact.

### Editor

**Tagger**:
The per-Master editor surface for marking and tagging Sections.
_Avoid_: tagging view, annotator.

**Builder**:
The per-Cut editor surface for assembling Sections into a Cut.
_Avoid_: timeline, composer, sequencer.

**EDL**:
The Builder's output data — the ordered clips plus overlays that a render turns into a Cut.
_Avoid_: timeline, project, recipe.

**Blur gate**:
The mandatory human verification a Promo must pass before export.
_Avoid_: review queue, moderation, approval flow.

## Relationships

- A **Master** has many **Scenes** (auto) and many **Sections** (creator-drawn, seeded by Scenes).
- A **Section** carries one or more **Tags**.
- A **Cut** is assembled from **Sections** selected by **Tag** (scope: this Master or whole library).
- A **Promo** is a **Cut** rendered for one **Platform**; only **Promos** pass the **Blur gate**.
- A **Variant** is the storage parent of exactly one **Cut** or one **Promo**.

## Example dialogue

> **Dev:** "When the creator makes a '30s teaser', does it go through the blur gate?"
> **Creator:** "No — that's just a **Cut**, it's mine to keep. The gate only fires when I turn
> that Cut into a **Promo** for TikTok and it leaves the app."

## Flagged ambiguities

- **"teaser"** meant both a short highlight (a **Cut**) and a blurred platform version (a
  **Promo**) — resolved: distinct concepts (ADR-0001).
- **"section" vs "scene"** — resolved: a **Section** is creator-owned and the assembly unit;
  a **Scene** is an auto seed only (ADR-0002).
