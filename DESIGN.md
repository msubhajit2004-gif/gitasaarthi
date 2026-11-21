---
# gstack: design-md-format=spec
name: GitaSaarthi
description: "A quiet, private reading room at night. Warm ink, one gold, serif type, two facing pages."
colors:
  ground: "#151412"
  surface: "#1b1a17"
  surface-raised: "#22201d"
  text: "#ebe7df"
  text-muted: "#b4aea2"
  text-faint: "#8f897d"
  accent: "#d4b26a"
  on-accent: "#151412"
  error: "#e5897d"
  success: "#8fbf9f"
  ground-light: "#efede8"
  text-light: "#23211d"
  text-muted-light: "#5a554c"
  accent-light: "#6f531a"
  error-light: "#a8321f"
typography:
  display:
    fontFamily: Instrument Serif
    fontWeight: 400
    fontSize: clamp(54px, 3.9vw, 80px)
    lineHeight: 1.08
    letterSpacing: -0.005em
  title:
    fontFamily: Instrument Serif
    fontWeight: 400
    fontSize: clamp(44px, 3.4vw, 58px)
    lineHeight: 1.12
  reading:
    fontFamily: Newsreader
    fontWeight: 400
    fontSize: clamp(24px, 1.55vw, 30px)
    lineHeight: 1.6
  body:
    fontFamily: Newsreader
    fontSize: 1.125rem
    lineHeight: 1.55
  label:
    fontFamily: Newsreader
    fontSize: 0.9375rem
    lineHeight: 1.4
  sanskrit:
    fontFamily: Tiro Devanagari Sanskrit
    fontWeight: 400
    fontSize: clamp(30px, 2.4vw, 46px)
    lineHeight: 1.65
  wordmark:
    fontFamily: Tiro Devanagari Sanskrit
    fontWeight: 500
    fontSize: clamp(30px, 1.9vw, 38px)
rounded:
  sm: 3px
  md: 6px
  full: 50%
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 80px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
  input:
    borderColor: "{colors.text-faint}"
    rounded: "0"
  nav-link:
    textColor: "{colors.text-muted}"
---

# GitaSaarthi

## Overview

**Creative North Star:** A quiet, private reading room. You are alone at night with one wise voice, and nothing asks for your attention.
**Product context:** A private, account-based web app (desktop first). A person says what is weighing on them; Krishna asks two questions, then offers one Bhagavad Gita verse and one four-step CBT practice. Dashboard (streak, mood), journal, breathing exercise, an always-open Safe Harbor page of helplines, and an admin view.
**Mode per surface:** sign-in: Operate. Home: Experience. Chat reply: Read. Dashboard: Operate. Admin: Operate. Safe Harbor: Read.
**Reference sites:** none opened. A 2026 web search of Calm, Headspace and Insight Timer roundups found only mobile-first listicles and no independent design analysis, so the system follows the product's own goal, not the category.
**The thing to remember:** it felt like a quiet, private room.
**Key characteristics:**
- One serif voice, one gold, no cards, no icons, no gradients, no glow.
- Two facing pages split by a thin vertical line: question and verse, streak and mood.
- The Sanskrit verse is the brightest, largest thing in a reply.
- Safe Harbor is one fixed text link, always visible, never decorative.

## Colors

**Strategy:** Restrained. Warm ink neutrals, one accent (gold), and a rose reserved for Safe Harbor and errors.
**Light or dark:** dark by default. People use this late and alone, on a laptop in a dim room; a light theme exists (`data-theme="light"`) as the same room by day: paper `ground-light`, ink `text-light`, a deeper gold `accent-light` so the accent still reaches 4.5:1 on paper.
Gold marks only things you can act on, plus the verse reference and the wordmark. It is never used on large surfaces. `error` (rose) never decorates: it appears for Safe Harbor's dot and form errors only. Dark surfaces step up (`ground`, `surface`, `surface-raised`) instead of using shadows. Body text contrast is 6:1 or better in both themes.

## Typography

Two serif voices plus the Devanagari. **Instrument Serif** (Google Fonts, weight 400 only, OFL licence) sets headlines: the home question, page titles, the dashboard greeting. It has one weight and an italic that this system never uses (an italic display serif is a known "editorial" cliché). **Newsreader** (Google Fonts, optical sizes 6..72, weights 400 and 500) carries all reading and interface text, because the product is read slowly. **Tiro Devanagari Sanskrit** sets the Sanskrit and the wordmark, with Noto Serif Devanagari as the fallback for rarer conjuncts.
Verification: Instrument Serif's weight, italic and licence were confirmed from several font-package sources; the official Google Fonts page could not be opened, so re-check its weight list when loading.
Scale: 15px labels, 18px body, 24-30px reply text, 44-58px page titles, up to 80px for the home question, 30-46px Sanskrit. Reading text is lighter and larger than before. Weights 400 and 500 only. Sentence case. No italic emphasis, no all-caps labels, no letter-spaced small type. Headings wrap with `balance`, prose with `pretty`, and prose is capped near 68rem.

## Layout

A full-width frame (max 1920px) with side margins of `clamp(64px, 8vw, 160px)` and 80px between sections on the dashboard, so a large window gets a larger, airier page. At 1100px and up, home, dashboard and chat use two facing pages split by one 1px line (`line`); under 1000px everything is one column. The page is left-aligned. The home screen carries the last topic and the streak line; the dashboard's "Continue" starts with the last conversation. Sign-in is a single centred 460px form. Spacing is a 4px base; every control is at least 44px tall.

## Elevation & Depth

None. Depth comes from the surface steps and 1px hairlines at 12-24% of the text colour. There are no shadows, blurs, glows or gradients. The only soft effect is one slow gold text-shadow on the written name during the opening.

## Shapes

Mostly square. Radius is 0 on inputs (they are underlined), 3px on the primary button, 6px on small markers, and a circle only for the Safe Harbor dot and the breathing circle. Nested elements follow inner radius = outer radius - gap.

## Components

- **Primary button:** gold fill, dark ink text, 44px+ tall, full width on forms. Hover brightens 8%; pressed dims 4%; focus ring 2px `text` with 3px offset.
- **Input:** a label above, a 1px underline below, no box. Focus turns the underline gold. Errors appear in rose directly beneath the field, in plain words with the fix.
- **Links:** text only, underlined with a faint line that turns gold on hover and focus. Feeling words on home are always faintly underlined.
- **Reply:** Krishna's words in `reading`, two numbered questions, reply options as ruled rows (no arrows), the verse centred between two thin gold lines, commentary folded behind "Read the commentary", the practice as a numbered list.
- **Streak and mood:** the streak number is no bigger than the greeting. The mood line plots only days with a check-in, and never invents values for the days between.
- **Footer:** links spread across the full width, the note centred on its own line below.

## Do's and Don'ts

- Do: keep gold to things you can act on, and the verse reference.
- Do: let the verse be the brightest and largest thing in any reply. Dim everything else to `text-muted` or `text-faint`.
- Do: keep the person's own words quiet and Krishna's reply carry the weight.
- Do: say what happened and what to do next in every error, in plain words, with no apology.
- Do: make the streak a record of what you did, never a score you can lose.
- Don't: add cards, icon tiles, avatars, typing dots, gradients, glows, or a second accent colour.
- Don't: use rose for anything but Safe Harbor and errors.
- Don't: show the opening more than once per browser session, or let it run past about 2.5 seconds.
- Don't: write copy that cheers, shames or sells ("You're doing great!", "Don't break your streak").
- Don't: show invented data. An empty account shows zeros and a prompt.

## Motion

- **Approach:** minimal-functional.
- **Easing:** enter(ease-out) exit(ease-out) move(ease-in-out); the site uses `cubic-bezier(.22, 1, .36, 1)` for colour and underline changes.
- **Duration:** micro(150ms) for colour and underline; 200ms for the fade between pages.
- **The one authored moment:** the name गीता सारथी written letter by letter, each letter drawn left to right like a pen stroke, then settling with one soft gold glow, about 2.5 seconds, once per browser session before sign-in. Skippable, and shown static under `prefers-reduced-motion`.
- **Between pages:** a 200ms cross-fade (CSS view transitions), switched off under `prefers-reduced-motion`.

## Considered and declined

An independent design agent proposed a "lamp-lit study" for the same brief. Adopted as rules: the streak never shames, and the verse is the brightest thing on screen. Declined, with reasons: a warm radial glow behind the verse (decoration, and this system has no glow); Fraunces for the wordmark and Instrument Sans for the interface (a typeface change on every screen, and Fraunces is also on the overused list); an indigo action colour (a second accent breaks the single-gold rule).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-11-20 | Replaced the old psychAI DESIGN.md (kept as DESIGN.old.md) with this system | The old file described a different product, palette and fonts, and pointed at a retired app.py |
| 2026-11-20 | Newsreader kept for reading text and interface only | Read surface; it is no longer the display voice |
| 2026-11-21 | Instrument Serif for headlines; reading text a step larger and lighter; margins 8vw; opening cut to ~2.5s; 200ms fade between pages | User chose typography, layout and motion changes in /design-consultation (update) |
| 2026-11-20 | Gold only on actionable things; rose only for Safe Harbor and errors | Keeps one accent, so the page stays quiet |
