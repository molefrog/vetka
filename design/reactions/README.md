# Vetka Reactions — design handoff

The reaction-sticker pack and visual treatment for Vetka's FigJam-style stamp/comment overlay.
**Start with [`REACTIONS.md`](./REACTIONS.md)** — it's the source-of-truth spec (the pack, the
physical-sticker treatment, placement/anchoring, palette, and how to add a new signal).

Contents:
- `REACTIONS.md` — implementation spec / instructions.
- `reactions/*.svg` — the 8 branded "Vetka Signal" stickers (heart, star, fire, wow, like, idea, save,
  question). Source of truth for the custom signal art.
- `reactions-preview.html` — open in a browser to see the pack with the sticker treatment (white
  die-cut edge, soft shadow, tilt) on white/photo/dark backgrounds at real size.
- `icons/reactions-overlay.svg` — the overlay/stamp toolbar glyph (the source for the `reactions` icon
  already inlined in `notch/src/NotchIcon.tsx`).

## Implementation status

The reactions **overlay UI is not built yet** — these are design files, not wired code.

- **Backend: done.** `reaction` table in `src/db/schema.ts` and the GET/POST endpoints in
  `src/routes/api/notch/reactions.ts` store an emoji, `x`/`y` (0–100 %) position, author, and optional
  `body` comment per page URL.
- **Widget: inert stub only.** A `reactions` icon (`notch/src/NotchIcon.tsx`) and a "Reactions" button
  slot (`notch/src/Widget.tsx`) exist, but the button has **no onClick** — there is no overlay
  component, no signal/emoji picker, and no stamp rendering. The 8 signals here aren't referenced in
  code yet.

## Notes for whoever builds the overlay

- The current `reaction` schema stores only raw `x`/`y` percentages. `REACTIONS.md` §2c/§3 ask for a
  **persisted per-sticker `tilt`** and a **stable content `anchor`** (DOM selector / text range) plus
  **count aggregation** for duplicates — the existing schema does not capture these. Plan a migration
  before building placement.
- The brand logo referenced by `REACTIONS.md` §6 ("sits in the wheel hub") is **not** duplicated here;
  it lives at `public/vetka-logo.svg`.
- The `.dc.html` reaction prototypes mentioned at the end of `REACTIONS.md` were not part of the
  handoff bundle and are intentionally omitted.

---
Provenance: copied from the gitignored `local-drafts/design_handoff_reactions/` so it's visible on
GitHub. Edit the spec/art here.
