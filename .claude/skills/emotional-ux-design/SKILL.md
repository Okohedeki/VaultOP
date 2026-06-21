---
name: emotional-ux-design
description: >
  Shape how VaultOP *feels*, not just what it does — interaction polish, delight,
  perceived performance, cognitive ease, and emotional response. Use when building or
  refining any renderer view (sidebar, vault grid, the Tagger/Builder editor, Cuts/Promos,
  the blur gate, onboarding, empty states, loading/progress, success moments). Triggers on
  "emotional design", micro-interactions, delight, polish, "feels flat / cold / unfinished",
  perceived speed, loading states, success/celebration, empty states, animations, haptics,
  curiosity, or making the UI feel premium and alive. Pairs with creator-studio-design (the
  house visual style) — this skill is the *emotional* layer on top of it.
license: MIT
metadata:
  source: "Bartek Marzec — The Product Design Playbook — @bartek_marzec (distilled)"
  pulled_from: "~/Documents/dotclaude/skills/pdp-plays-reference (sections/ui-ux-emotional.md)"
---

# Emotional UX design — VaultOP

Users don't just remember what VaultOP does — they remember **how it feels**. This skill
is the emotional/interaction layer: the plays that make the studio feel tactile, fast,
rewarding, and alive. It sits **on top of** `creator-studio-design` (the dark, content-first
house style): that skill decides how it *looks*; this one decides how it *feels*.

Full detail for every play — *What it is / Why it works / When to use / Do / Don't / Founder
Tip / Pair with / Make it Yours* — lives in
[`references/ui-ux-emotional.md`](references/ui-ux-emotional.md). Read the relevant play
before applying it; the *Pair with* links are the point — compose plays, don't cherry-pick one.

## The plays (index)

| Play | Use it for |
|------|-----------|
| **Micro Interactions** | tactile feedback on taps/drags/hovers/transitions — confirm intent, feel responsive |
| **Loading Feedback** | replace dead spinners with branded, context-aware waits (>~100ms) |
| **Success Moments** | reward meaningful completions — earned, short, emotionally charged |
| **Perceived Effort Delay** | a deliberate pause that makes a result feel considered/premium (not lag — luxury) |
| **Small Quirk** | a signature flourish on a repeated moment → brand recall + delight |
| **Empty States** | turn blank screens into activation: a headline, "what good looks like", one CTA |
| **Variable Reward** | light, purposeful unpredictability to pull users back (never hide function behind it) |
| **Spark Curiosity** | reveal just enough to create a gap users want to resolve |
| **Pattern Alignment** | borrow familiar patterns (CapCut/Descript muscle memory) — invisible design |
| **Progressive Disclosure** | show only what matters now; layer depth as confidence grows |

## How to apply it in VaultOP (concrete map)

Map each play to surfaces in this app (don't over-animate — polish must read as *premium*,
not noise; keep `prefers-reduced-motion` honored via the existing `--t`/`--t-fast` tokens):

- **Micro Interactions** — the sidebar nav active-state slide, the `＋ Add footage` press,
  drag-to-trim Section handles, add-clip in the Builder, hover-scrub on vault thumbnails.
- **Loading Feedback** — every job >1s already shows *what's happening* (creator-studio-design
  rule 6); upgrade bare states to branded, task-matched copy ("Finding scenes (3/12)…",
  "Rendering your cut…") instead of spinners.
- **Success Moments** — a brief, earned celebration when a **Cut renders**, a **Promo is
  approved** ("Safe to post ✓"), or the **first clip finishes analyzing**. Short, on-brand,
  not on every action.
- **Perceived Effort Delay** — the on-device AI steps (transcription, auto-blur detect) can be
  framed as "Analysing your footage…" so the result reads as considered, not generic.
- **Small Quirk** — one signature flourish (e.g. the gradient "creator-sunset" pulse) reused
  on key moments so it becomes ownably VaultOP.
- **Empty States** — Vault/Cuts/Promos/Activity each get a warm headline + "what good looks
  like" + one CTA (the Cuts/Promos `emptyHint` is the seed — make them teach, not just label).
- **Variable Reward / Spark Curiosity** — light touch only; e.g. surfacing a "you might cut
  this next" suggestion from tags. Value must always beat novelty.
- **Pattern Alignment** — keep editor gestures familiar (CapCut/Descript): scrub, razor/split,
  drag-trim, timeline zoom — so creators "just get it".
- **Progressive Disclosure** — presets first (aspect, CC, Music), advanced controls behind a
  "More" affordance; don't dump every knob at once.

## Workflow

1. Name the surface and the feeling you want (snappy? reassuring? celebratory?).
2. Open `references/ui-ux-emotional.md`, find the matching play(s), and read its
   *Do / Don't* + *Make it Yours* prompts.
3. Implement with the existing design tokens (`src/design/tokens.css`) and motion vars;
   never break `prefers-reduced-motion`.
4. Follow the play's **Pair with** links to compose (e.g. Loading Feedback → Success Moment).
5. Keep it intentional: if motion slows clarity or speed, cut it.

> Attribution: plays distilled from Bartek Marzec's *The Product Design Playbook*
> (@bartek_marzec), MIT. Pulled into this repo from `~/Documents/dotclaude`.
