# The Geometry Dash school of audio-visual design

Read this before writing any visuals. It explains *why* GD-style sync feels so much
better than a spectrum analyzer, and gives you a vocabulary to design with.

## Contents
1. The core idea: authored events, not mapped signals
2. Anatomy of a hit
3. Trigger vocabulary (GD trigger -> function in `lib/fx.ts`)
4. Layers and depth
5. Section blueprint
6. Motifs, palettes, restraint
7. Case study: Aperture by chunlv1
8. Ban list

---

## 1. The core idea: authored events, not mapped signals

A generic visualizer maps a continuous signal to a continuous property: `bar height = FFT bin`.
It is always "on", always moving, and nothing in it is *about* the music. It reads as screensaver.

A Geometry Dash level is **choreographed**. A creator listens to the song and places a
discrete trigger at each moment that matters: this kick pulses the background, that snare
shakes the camera, bar 17 swaps the whole color scheme, the drop rotates the world 90 degrees.
Between triggers, the screen is comparatively calm. That contrast is where the impact comes from.

So the rule is:

> **Drive visuals from events (onsets, beats, bars, sections), not from raw levels.**
> Use continuous levels (`env`, `slow`) only for ambient, secondary motion.

`scripts/analyze_audio.py` exists to give you the event list. `lib/fx.ts` is how you spend it.

## 2. Anatomy of a hit

Measured from a 20 fps burst through a big hit in Aperture (about 1.2 s of footage), and
consistent with how GD pulse + color triggers behave:

| Time | What the screen does |
|---|---|
| -3 to -1 frames (at 60 fps) | **Dip.** Scene darkens / pulls back slightly. Anticipation. |
| 0 | **Flood.** Whole frame jumps to a saturated accent color. |
| 0 to +3 | **Peak.** Near-whiteout; shapes *invert* (dark sparkles on white). Highest contrast of the whole section. |
| +3 to +15 | **Release.** Ease-out decay back to the scene's resting look; elements settle and keep drifting. |

Takeaways:
- **Attack is instant (0 frames).** Never ease *in* to a hit. Ease out of it.
- **Decay is 100 to 300 ms**, not 1 s. `decay: 5-8` frames at 60 fps. Longer feels mushy.
- **A hit moves several properties at once with different decays**: brightness fast (5 frames),
  scale medium (8), ring stroke width slower (12). Stacked decays make one hit feel physical.
- **The dip matters.** A hit after a dip reads twice as hard. But only use it before *big*
  hits (section boundaries, drops). On every kick it just flickers.
- **Strength gates**: use `minS` so only real hits trigger the big effect; weak ones get a
  small effect or nothing.

## 3. Trigger vocabulary

| GD trigger | What it does | Use here |
|---|---|---|
| Pulse | Flash a color channel to a color, fade back | `hit()` -> drive opacity / mix toward `pal.glow` |
| Color | Swap a channel's color over time | Palette per cue (`choreography.ts`); hard swap + flash |
| Move / Rotate / Scale | Eased transform, fired per beat | `stepEase()` -> degrees or px; `flip()` for alternating |
| Shake | Camera/object jitter | `shake()` scaled by `hit(snare)` |
| Camera zoom / offset / rotate | Move the view, not the objects | Wrapper `scale/translate/rotate` in `Visualizer.tsx` |
| Alpha | Fade layers in/out | opacity from `local` (frames since cue) |
| Toggle / Spawn | Turn groups on/off, repeat a sequence | scene cues; `shift:` ripple on `hit()` |
| Static / Follow | Lock objects to the camera or world | parallax layers (section 4) |

Easing: GD leans on **ease-out** (exponential/back/elastic) for nearly everything. Linear
motion looks cheap. `easeOutExpo` is the default; `easeOutBack` for things that should overshoot
and settle (logo slams, scale-ups); `easeOutElastic` sparingly for playful bounce.

## 4. Layers and depth

Good GD levels are never one flat plane. Build at least four layers and give each its own
response to the music:

1. **Background** (far): gradient or large soft shape. Reacts to *slow* bass level and section.
   Barely moves. Takes the pulse color wash.
2. **Midground decoration**: line-art, rings, constellations, windows. Reacts to beats and bars.
3. **Hero layer**: the one thing the eye follows (sun, portal, core). Biggest reaction, kick-locked.
4. **Foreground**: sparkles, dust, streaks, near-camera particles. Faster parallax, hat-locked.
5. **Post**: vignette, flash, dip, camera punch, optional letterbox. Applied to everything.

Parallax factor (`z` in 0.15 to 1) multiplies scroll speed. Foreground gets 1, background 0.15.

## 5. Section blueprint

Visual density tracks musical density. Map detected `sections[].role` to a plan:

| Role | Look | Camera punch | Scene change |
|---|---|---|---|
| calm / intro | Sparse, light or dark-minimal, thin lines, lots of empty space | 0.2 to 0.4 | Slow entrance (ease-out expand over ~0.4 s) |
| build | Tension: add layers, tighten palette, speed ramps with level | 0.5 to 0.8 | Add one element per 2 bars; last bar before drop gets the **dip** |
| drop | Max contrast, hero layer big, camera zoom + shake, strongest palette | 1.0 to 1.5 | Whiteout cut on the downbeat, then swap scene every 8 bars |
| groove | Between build and drop; same motifs, medium energy | 0.7 to 1.0 | Swap scene every 8 bars |
| breakdown | Drop *everything*: strip back to the intro look, let silence read | 0.2 to 0.4 | Hard cut to calm palette; this contrast sells the next drop |
| outro | Resolve: fade to the intro motif, then a clean end card | 0.0 to 0.3 | Whiteout or slow fade |

Scene changes land **on downbeats** (bar starts), never mid-bar. Use `barToFrame()`.

## 6. Motifs, palettes, restraint

- **2 to 3 motifs, repeated.** One shape language gives identity: e.g. four-point sparkle +
  concentric rings + rounded windows. Reusing them across scenes is the point, not a flaw.
- **Palette = 4 to 5 colors per section.** One `accent` that means "hit". `glow` must be the
  brightest color. Change palette at section boundaries only.
- **Silence is a visual.** In quiet parts, let things be still. If everything moves all the
  time, nothing hits.
- **Always something tiny moving** though: slow rotation, drifting dust, 0.05 deg/frame. A
  frozen frame looks like a bug.
- **No gradients of rainbow, no default neon unless the song is neon.** Choose from the
  music's mood: warm paper + gold feels nostalgic; violet/pink dusk feels dreamy; near-black + a
  single blue orb feels cinematic.
- **Typography**: if any, 1 font, large, slammed on a downbeat with `easeOutBack`, held, and
  cut or dissolved on the next. Never scrolling credits-style text over a drop.

## 7. Case study: Aperture by chunlv1

Reference: a ~2:10 Geometry Dash level, 1080p60, about 152 to 155 BPM. Studied from a
frame sample every 4 s plus a dense 20 fps burst through a hit. This is an observation of
*approach*, not a spec to copy; do not reproduce its art, characters or assets.

**Overall shape (matches the song):**
- **First ~25 s: quiet intro.** Pale parchment world, ink diagrams: concentric orbit circles
  with dotted rings, tick marks, hand-drawn notes, small instruments. Low contrast, slow
  rotation, light pulses.
- **~25 s: the drop.** Palette shifts to violet and pink with warm gold; large layered
  silhouettes with floating paper/polaroid shapes at different depths (parallax); a gold ring
  frame and thin gold letterbox bars give a "cinema" border.
- **Long middle:** a new *setting* roughly every 4 to 8 s (every 4 to 8 bars): a dim study
  with a warm lamp and a glowing blue window; a golden astrolabe ring around a blue orb; a
  starfield seen through rounded film-strip windows with a tilted perspective sweep; an
  observatory dome at dusk; a large moon with fine line-art over it; a satellite. Each is its own
  composition, but all share the same motifs.
- **~113 s: breakdown** (the audio energy drops off a cliff here). Visuals go to cream/paper
  again with a compass and handwriting, echoing the intro.
- **End:** nebula, end card.

**Motifs that carry the identity:**
- Four-point concave **sparkle star**: appears everywhere, sizes vary, twinkles on hats.
- **Concentric rings** with dotted/ticked outlines, often rotating in opposite directions.
- **Constellation line-art**: thin lines linking bright points; brighten on hits.
- **Rounded-rectangle windows** (film strip / TV frames) as a way to frame and re-frame scenes.
- **Bloom**: bright things have a soft halo; dark scenes have one warm light source.
- **Depth of field**: foreground out of focus, midground sharp.

**What to learn from it:**
1. Strong **concept per section** (a *place*), not just effects on a shape.
2. **Palette is the section marker**: you always know where you are in the song by color.
3. **Contrast between sections** is huge. The quiet parts earn the loud parts.
4. **Hits are whiteout-level**, but short. Most of the time the screen is moody and dim.
5. **Camera is a character**: perspective tilts, zoom pushes, slow drifts.
6. Detail density is *high*, but it is **layered**: 80% of the detail is static or slow
   background, and only 2 or 3 things hit on any given beat.

## 8. Ban list (the "generic AI visualizer" tells)

- A row of vertical bars along the bottom driven by raw FFT.
- Every element moving every frame with the same easing and the same speed.
- One palette for the whole video. Rainbow hue rotation.
- Raw band level mapped straight to scale (jitter). Use `env` or `hit()`.
- `Math.random()` anywhere. (Breaks Remotion's parallel rendering; use `rnd()`.)
- CSS `transition` / `animation` / Tailwind animate classes. (Won't render.)
- Text of the song title bouncing in the middle of the frame for the whole song.
- Scene never changes. Or changes mid-bar. Or changes with no flash/dip.
- Heavy `filter: blur()` on full-frame layers (slow and can flicker). Use radial gradients.
