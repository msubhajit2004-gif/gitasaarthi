# Mayur Pankh Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the self-drawing SVG feather to match the reference photo: diagonal, wispy and violet, with a copper-ringed eye.

**Architecture:** Only the geometry and paint inside `buildFeather()` in `js/intro.js` change, plus the colour and keyframe rules in `css/intro.css`. The lifecycle (classes, timers, skip, sound, inert, failsafe) stays untouched.

**Tech Stack:** Vanilla JS that generates SVG, and CSS keyframes. There is no build step and no test framework. Verification is done in the browser with Playwright frame captures.

**Spec:** `docs/superpowers/specs/2026-11-16-mayur-pankh-restyle-design.md`

## Global Constraints
- **Timeline:** shaft 0–1000ms; barbs start 1000ms + i×step and finish by about 2500ms; tint starts at 2500ms; eye layers 3000–3700ms; `T_LEAVE` 3800 and `T_DONE` 5100 are unchanged.
- **No raster image:** the photo is reference only.
- **Untouched:** `feather-bg` stays a static, non-animated copy built by the same `buildFeather(id, false)`, and the reduced-motion path is unchanged.
- **No horizontal scroll** at 390px, and the `.gs-intro__stage` box stays inside the viewport.
- **Versioning:** bump the cache query from `?v=20` to `?v=21` in `index.html`.

## Review Focus
1. **Diagonal fit on phones:** a rotated feather must not overflow the 390px stage. Check this with the phone frame capture in Task 2.
2. **Verse text over the background:** on the homepage the violet eye must not sit right behind the Sanskrit lines at full strength. Check this with the desktop home capture in Task 2.
3. **Beige theme:** violet at the light-mode opacity must still read as a feather and not as a stain. Check this with the beige home capture in Task 2.
4. **Paint cost:** about 120 glowing strands must not stutter. Check the frame-time sample in Task 2; drop the glow under 768px if needed.
5. **Unique ids:** gradient and filter ids must stay prefixed per copy (`fi`, `fb`). Check in Task 1 that the DOM has no duplicate ids.

---

### Task 1: New feather geometry and paint

**Files:**
- Modify: `js/intro.js` (`SHAFT`, `barbColour`, `buildFeather`)
- Modify: `css/intro.css` (`.f-barb`, `.f-shaft`, eye and glow rules)
- Modify: `index.html` (`?v=20` → `?v=21`)

**Interfaces:**
- Consumes: the existing `svgEl`, `radial`, `jitter` and `onShaft(u) → [x, y]` helpers.
- Produces: `buildFeather(id: string, animated: boolean) → SVGSVGElement`. The signature is unchanged, so callers are untouched. Classes used by the CSS: `f-shaft`, `f-barb` (style vars `--i`, `--c`), `f-vane`, `f-glow`, `f-eye > .e1..e5`.

- [ ] **Step 1: Keep the viewBox** at `0 0 400 700` and draw the feather inside a group `<g transform="rotate(38 200 350)">`. The diagonal then comes from one rotation, and the timeline code needs no change.
- [ ] **Step 2: Change `SHAFT`** to `[[200,690],[188,520],[214,330],[200,90]]`, which gives a slight S-curve quill.
- [ ] **Step 3: Rebuild the barbs.**
  - **Count:** `N = 60` per side, `t ∈ [0.04, 0.97]`.
  - **Length:** `len = (30 + 150·sin(π·t^1.8)) · (0.75 + 0.5·jitter(k+side·97))`.
  - **Shape:** a cubic path from the shaft point that rises toward the tip and then droops outward. Control 1 is `(x+s·len·0.35, y−len·0.55)`, control 2 is `(x+s·len·0.8, y−len·0.6)`, and the end is `(x+s·len·1.0, y−len·0.35 + droop)`, where `droop = 20·jitter(k)`.
  - **Base threads:** below `t < 0.25`, reduce the stroke opacity (`style --o`) to 0.45.
- [ ] **Step 4: Change `barbColour(t, i)`.** Interpolate violet `#6d28d9` (t<0.35), then indigo `#4338ca` (0.35–0.65), then turquoise `#22d3ee` (0.65–0.85), then green `#34d399` (>0.85). Every 5th barb is `#a78bfa` for sheen. Drop the bronze-gold every-third rule.
- [ ] **Step 5: Rebuild the eye.** Centre it at `onShaft(0.84)`.
  - **Layers:**
    - `e1` ellipse rx 58 ry 46, fill copper-pink `#d98b7a`, stroke `#f0b49a`
    - `e2` heart path roughly 40×36, fill teal `#14b8a6`
    - `e3` ellipse rx 22 ry 18, fill `#1d4ed8`, radial to `#60a5fa`
    - `e4` ellipse rx 13 ry 11, fill `#0b1445`
    - `e5` highlight ellipse, fill `#bfdbfe` at 0.6
  - **Orientation:** the eye's long axis follows the shaft direction, since it sits inside the rotated group.
- [ ] **Step 6: Restyle the glow and vane.**
  - **Glow:** the glow radial is violet `#7c3aed` 0.45 → transparent. The vane radial is indigo `#4338ca` 0.35.
  - **Strand glow:** add `filter: drop-shadow(0 0 3px rgba(139,92,246,.55))` on `.feather .f-barbs` from the colour stage on, set as a class transition, not animated per frame. Remove it under `@media (max-width: 768px)`.
- [ ] **Step 7: CSS values.**
  - **Barbs:** `.f-barb` stroke-width 0.9 and `opacity: var(--o, 0.9)`.
  - **Draw stagger:** the barb draw delay is `calc(1000ms + var(--i)*24ms)` with `--i = k`, so 60×24 = 1440ms.
  - **Shaft:** stroke `#e9b04a`.
- [ ] **Step 8: Verify the DOM.** Run `[...document.querySelectorAll('[id]')].map(e=>e.id)` and check there are no duplicates. Check that `.gs-intro .f-barb` count is 120 and `.feather-bg .f-barb` count is 120.

### Task 2: Visual verification and background tuning

**Files:**
- Modify (only if a check fails): `css/intro.css` (`.feather-bg.is-on` opacities, `.feather-bg .feather` height and blur)

**Interfaces:**
- Consumes: Task 1's `buildFeather` output. No new names.

- [ ] **Step 1: Capture frozen frames** at 700, 1900, 3000 and 3900ms on 1492×832. Stub `setTimeout` for 3800 and 5100 through `addInitScript`, and pause `document.getAnimations()` at each `currentTime`.
  - **Expected:** a diagonal gold quill, then gold wisps, then violet-to-turquoise colour, then the copper eye.
- [ ] **Step 2: Phone capture** at 390×844 at 3900ms.
  - **Expected:** the feather fits inside the viewport and `scrollWidth <= innerWidth`.
- [ ] **Step 3: Real-time run** in a fresh page.
  - **Expected:** `intro-leaving` is present at about 4.3s, and the overlay is gone, `inert` is removed and `.feather-bg.is-on` is set by 5.8s. No console errors.
- [ ] **Step 4: Home captures** in dark and beige at 1492×832.
  - **Expected:** the Sanskrit verse reads clearly. If the eye blob competes with the text, lower the opacity in 0.04 steps: dark from 0.4, beige from 0.36, mobile 0.28/0.26.
- [ ] **Step 5: Frame-time sample.** During 2500–3800ms, use `requestAnimationFrame` deltas and expect the median to be at or below 20ms. If it is higher, drop the strand drop-shadow entirely.
