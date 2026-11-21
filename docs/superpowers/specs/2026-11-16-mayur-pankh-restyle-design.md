# Mayur Pankh intro restyle: short design (approved 2026-11-16)

**Intent:** make the self-drawing feather intro look like the reference photo (`c:\Users\KIIT0001\Downloads\download.jpg`). The intro must still draw itself in code, not be a photo.

**Approaches**
1. Redraw in SVG code in the photo's style. **Chosen.** It keeps the line-by-line drawing and stays sharp at any size.
2. Draw golden lines, then crossfade into the photo. Rejected: the swap is visible, the photo goes soft at full screen, and its licence is unknown.

**Look**
- **Shape:** diagonal, from the bottom left to the top right, with a slightly curved quill. The eye sits near the upper-right end.
- **Barbs:** about 60 per side, long, wispy and curved. Length and angle vary. They thin into loose threads toward the base.
- **Colour:** gold while drawing, then violet and indigo along the length, shifting to turquoise and green near the eye. A soft glow on the strands.
- **Eye:** a copper-pink outer ring, a heart-shaped teal patch, and a deep blue centre with a highlight. It appears last.

**Keep unchanged**
- **Timing:** stem 0–1s, barbs 1–2.5s, colour 2.5–3.8s, then the eye, then the zoom and dissolve (leave at 3.8s, done at 5.1s).
- **Controls:** Skip, the sound button and the music start.
- **Behaviour:** replay on every refresh, reduced motion, mobile layout, and the 8s failsafe.

**Background:** the homepage copy stays centred and blurred, now diagonal and violet-blue. It must stay dim enough that the verse text reads clearly.

**Left to the builder:** the exact violet shades, and the glow strength. The glow may be dropped on phones.
