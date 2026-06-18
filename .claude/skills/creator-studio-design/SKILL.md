---
name: creator-studio-design
description: Design VaultOP's UI like a modern creator/video studio (CapCut/Descript/OnlyFans-tool feel), not a developer tool. Use when building or restyling any VaultOP view — the vault library, ingest, the create/teaser/compilation flows, the blur-review gate, deliverables, or onboarding. Enforces content-first layouts, creator vocabulary (not dev jargon), template/one-click workflows, friendly empty states, and informative progress. Triggers on UI/UX, redesign, "looks like a dev tool", styling, components, or any renderer work.
---

# Creator Studio design

VaultOP is for **content creators**, not developers. The UI should feel like CapCut /
Descript / a polished OnlyFans studio: confident, dark, content-first, low-friction.
If a screen looks like a terminal, a CRUD admin, or a CI dashboard, it's wrong.

## Principles

1. **Content is the hero.** The vault is a rich **visual grid of thumbnails**, never a
   list of filenames + hashes. Big previews, hover-scrub, generous spacing. The media
   fills the screen; chrome recedes.
2. **Speak creator, not engineer.** Rename every label to the words a creator uses:
   - Asset → **Clip / Footage**   · Segment → **Scene / Moment**   · Variant → **Cut / Promo**
   - Job → (hide it; show **"Processing…"** with what's happening)
   - "requires_review" → **"Needs a safety check"**   · approved → **"Safe to post ✓"**
   - transcode/scene_split/render → **"Preparing", "Finding scenes", "Rendering"**
   Never surface `input_hash`, content hashes, state-machine names, or `.mov` filenames as
   primary text.
3. **One-click / preset workflows (CapCut model).** Big, obvious primary actions:
   **Make a teaser**, **Build a compilation**, **Make it safe to post**, **Export for
   TikTok/IG/Reddit**. Presets over knobs. Advanced controls live behind a "More" affordance.
4. **Real-time, drag-and-drop, preview-first.** Show a live preview/player. Drag footage in;
   drag clips into a teaser. Hover a scene to scrub it. Selection and actions are direct.
5. **Friendly empty states (never a blank dashboard).** First run shows warm copy + an
   illustration + a single clear CTA ("Drop your first shoot →"), and offers a sample so the
   app is never empty. Each section's empty state teaches the next step.
6. **Progress that informs.** Anything >1s shows *what's happening* ("Encrypting…",
   "Finding scenes (3/12)…", "Rendering teaser…"), with a real progress bar — never a bare
   spinner. Celebrate completion ("Teaser ready 🎉").
7. **Safety framed positively.** The blur gate is "**Make it safe to post**", not a "review
   queue". Green "Safe to post ✓" when done; calm, confidence-building, not alarming.

## Visual language

- **Dark, premium, warm** — not flat black, not dev-blue. Base near `#0E0E12`, elevated
  surfaces with subtle warmth. A **vibrant gradient accent** (creator energy — e.g. coral→
  magenta or violet→pink), used sparingly on primary actions and active states.
- **Typography:** a friendly modern sans for everything (Inter / SF). **No monospace in the
  UI** except a tiny debug panel. Clear type scale, generous line-height, real headings.
- **Shape & depth:** rounded corners (10–16px), soft shadows, hairline borders, smooth
  120–200ms transitions, `prefers-reduced-motion` respected.
- **Status as soft pills**, not raw badges with dots-and-codes. Color = meaning
  (green safe, amber processing, red attention).
- **Thumbnails:** rounded, 16:9 or the clip's aspect, hover-scrub, duration chip, quick
  actions on hover (similar, make teaser, mask).

## Layout

- **App shell:** a slim left rail or top tabs for the few real sections — **Vault**,
  **Create**, **Deliverables** (rename of jobs/variants), maybe **Insights** later. A clean
  title, not "VAULTOP local-first · encrypted" in mono.
- **Vault:** search + filter chips (tags) up top, a big responsive thumbnail grid below,
  a detail/preview drawer on click. Processing items show inline progress on the card.
- **Create:** preset cards (Teaser, Compilation, Per-platform set) → pick clips → preview →
  render. Mirrors CapCut's template-slot flow.
- **Safety check:** a focused, calm full-bleed review of the frame with the player; draw
  masks directly on the video; one prominent **Approve & make safe** button.

## Anti-patterns (the current dev-flavored look)
- Monospace header / "local-first · encrypted" tech tagline.
- A "Jobs" panel exposing `transcode / scene_split / render` and Done badges.
- Filenames + content-hash as the primary label on a card.
- Bare spinners; raw status enums; CRUD-list density.

## Use the installed `frontend-design` skill
Compose with the repo's `frontend-design` skill for the actual component craft — this skill
sets the *creator-studio direction*; `frontend-design` ensures the execution isn't generic.
