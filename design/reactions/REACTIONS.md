# Vetka Reactions — Sticker Pack & Implementation Guide

How to implement Vetka's reaction stickers: an **OS-agnostic pack** (custom signals + normalized
emoji) and the **physical-sticker treatment** (white die-cut outline, soft shadow, slight tilt).

---

## 1. The pack — two layers

Reactions come from two sources, but they render through **one pipeline** so they look like one set.

### Layer A — Vetka Signals (custom, in this folder)
Eight branded reactions in `reactions/*.svg`. Monoweight line illustrations in the logo's hand, on the
**Coral & Cream** palette. These are the default favorites in the wheel ring.

| File | Reaction | Means | Color |
|---|---|---|---|
| `heart.svg` | Heart | Love this | Coral |
| `star.svg` | Star | A standout | Coral |
| `fire.svg` | Fire | This is great | Coral |
| `wow.svg` | Wow (`!`) | That surprised me | Coral |
| `like.svg` | Like (thumb) | Agree / nice work | Sage |
| `idea.svg` | Idea (bulb) | Insightful | Sage |
| `save.svg` | Save (bookmark) | Keep for later | Sage |
| `question.svg` | Question (`?`) | I have a question | Sage |

All are `viewBox="0 0 24 24"`, `stroke-width="1.5"`, round caps/joins. Coral group =
`#E8543A` stroke + `#FDDCCC` fill; sage group = `#6B8C7D` stroke + `#6B8C7D @ 20%` fill. The `?` and `!`
end in a filled bud-dot — the same motif as the branch logo. **Don't recolor them per host site**;
their consistency is the whole point. (See "Adding a new signal" below to extend the set in-style.)

### Layer B — Emoji long-tail (normalized)
Everything beyond the eight. **Do NOT render native Unicode emoji** — the platform emoji font makes
`❤️` look different on macOS, Windows, Android, and old browsers, which kills brand consistency and the
die-cut treatment. Instead render every emoji from a **single SVG emoji set you ship**, so it's
identical everywhere.

**Recommended:** [Twemoji](https://github.com/jdecked/twemoji) (CC-BY 4.0) or
[Noto Emoji](https://github.com/googlefonts/noto-emoji) (OFL) — both are complete SVG sets.

```js
// codepoint → your self-hosted Twemoji SVG. Don't hot-link a CDN in production; bundle the subset.
function emojiSvgUrl(emoji) {
  const cp = [...emoji].map(c => c.codePointAt(0).toString(16)).join('-')
    .replace(/-fe0f\b/g, ''); // strip variation selector, Twemoji filenames omit it
  return `/assets/emoji/${cp}.svg`;
}
// render: <img class="vetka-sticker-art" src={emojiSvgUrl('🔥')} alt="🔥" />
```

Ship only the subset you expose in the picker (plus search results), lazy-load the rest. Both Signals
and emoji end up as an `<svg>`/`<img>`, so the renderer below treats them identically.

---

## 2. The sticker treatment

Every reaction — Signal or emoji — gets the same physical-sticker look: **white die-cut edge,
soft drop shadow, slight rotation.** This is the unifier; apply it in ONE component.

There are two ways to get the white edge depending on the art:

### 2a. Chip method — for the line Signals (recommended default)
The line glyphs sit on a white rounded chip. Clean, crisp, and the white "card" *is* the die-cut.

```css
.vetka-sticker {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px;              /* ≥44px = good touch/hit target */
  background: #fff;
  border-radius: 13px;                     /* or 999px for a round chip */
  box-shadow: 0 3px 9px rgba(40,35,25,.20);
  transform: rotate(var(--tilt));          /* see §2c */
}
.vetka-sticker > svg { width: 60%; height: 60%; display: block; }
```

### 2b. True die-cut method — for emoji / filled art
When the art is a full-color emoji, you want the white outline to hug the *silhouette*, not sit on a
card. Stack white `drop-shadow`s (a 1px halo in 8 directions) + one soft gray shadow. Put it on the
`<img>`/`<svg>` itself, no card:

```css
.vetka-sticker-art {
  display: block;
  filter:
    drop-shadow( 1.1px 0 0 #fff) drop-shadow(-1.1px 0 0 #fff)
    drop-shadow(0  1.1px 0 #fff) drop-shadow(0 -1.1px 0 #fff)
    drop-shadow( .8px  .8px 0 #fff) drop-shadow(-.8px  .8px 0 #fff)
    drop-shadow( .8px -.8px 0 #fff) drop-shadow(-.8px -.8px 0 #fff)
    drop-shadow(0 3px 4px rgba(40,35,25,.30));   /* soft cast shadow */
  transform: rotate(var(--tilt));
}
```
Scale the `1.1px`/`.8px` offsets with the art size (≈ size/27) for a consistent ~2px outline. The line
Signals can use the chip method (2a); custom Signals that you'd rather die-cut can use 2b too — they're
single-color so the halo reads fine.

> Pick ONE method per art type and keep it consistent. Mixing chip + die-cut in the same wheel looks
> sloppy. The spec page uses the **chip method** for Signals.

### 2c. The tilt (rotation)
A small random rotation makes them feel placed by hand. Compute **once at placement** and **persist it**
with the sticker record — never recompute on render, or stickers will jitter on every repaint.

```js
const tilt = (Math.random() * 26 - 13).toFixed(1) + 'deg';  // -13°..+13°
// store tilt on the placed-sticker row; apply via style: { '--tilt': row.tilt }
```
In the wheel/picker (not placed yet) use `0deg` or a fixed gentle alternating tilt; reserve the random
tilt for stickers dropped on the page.

---

## 3. Placement, counting, attribution (recap)
- **Anchor to content, not pixels.** Store each sticker against a stable target — a DOM selector /
  element id, or a text range (à la web annotations / `TextQuote` selectors) — plus an offset. Pixel
  x/y will scatter when the host page reflows (mobile, responsive breakpoints). This is the hardest
  part; decide the anchoring scheme before building placement.
- **Aggregate duplicates.** Same reaction near the same anchor → increment a count, show a small dark
  count badge, don't stack copies.
- **Attribution.** Each placement carries the user; hovering shows "You and N others". This is the
  social-graph surfacing that makes Vetka different from ephemeral FigJam stamps.

---

## 4. Palette (Coral & Cream)
`#F5EFE6` page bg · `#FDDCCC` card / coral tint · `#E8543A` coral accent · `#6B8C7D` sage muted ·
`#2C2018` text. Coral = warm reactions (heart, star, fire, wow); sage = considered (like, idea, save,
question). The count badge is `#2C2018` (text) with white ring.

---

## 5. Adding a new signal (stay in-style)
Match the existing eight exactly:
- `viewBox="0 0 24 24"`, `fill="none"`, `stroke-width="1.5"`, `stroke-linecap`/`linejoin="round"`.
- Monoweight **line**, not a filled silhouette (that's what separates these from emoji).
- Optional soft tint fill: coral group `#FDDCCC`; sage group `#6B8C7D` at `fill-opacity .2`.
- Where a glyph needs a dot (the `?`/`!` terminal, a bulb filament), make it a small filled circle in
  the stroke color — that bud-dot is the brand signature, reused from the logo.
- Assign it to coral (positive/warm) or sage (reflective) by meaning.
- Test at 20–24px on a white chip; the line must stay open and legible — no detail under ~1.5px.

---

## 6. Files
- `reactions/*.svg` — the eight Vetka Signals (source of truth).
- `reactions-preview.html` — open in a browser to see the pack with the sticker treatment on white,
  photo, and dark backgrounds at real size.
- `vetka-logo.svg` — the brand mark (currentColor; sits in the wheel hub).

> The `.dc.html` files in the project root (`VetkaReaction`, `Vetka Reactions`, `Vetka Custom
> Reactions`) are the design prototypes — reference them for structure and exact measurements, but they
> run on an internal prototyping runtime, not production code. Rebuild the widget in the target stack,
> rendered into a Shadow DOM so host-site CSS can't leak in.
