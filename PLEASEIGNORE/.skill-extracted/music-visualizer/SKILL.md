---
name: music-visualizer
description: Build music and audio visualizer videos in Remotion that look choreographed, in the style of Geometry Dash levels (beat-locked pulses, palette changes per section, camera punches, whiteout drops), instead of generic bouncing spectrum bars. Use this skill whenever the user wants a music visualizer, audio visualizer, lyric or song video, audio-reactive animation, beat-synced visuals, a visualizer for a track or beat, or anything "like a Geometry Dash level" or "synced to the music", even if they don't mention Remotion. Also use it when they share a reference video (for example a GD level) and want its feel recreated for a song. It includes an audio analysis script (beats, kick/snare/hat events, sections), a ready Remotion project template, and design guidance.
---

# Music visualizer (Geometry Dash school)

Make visualizers that feel *choreographed*, not *mapped*. The difference is the whole skill:
a spectrum analyzer maps a signal to a shape; a Geometry Dash level has an author who places
a flash on *this* kick, a shake on *that* snare, and a new color world at bar 17. Everything
below serves that.

This skill sits on top of the installed Remotion skills (`remotion-create`, `remotion-markup`,
`remotion-render`). Use those for generic Remotion questions; use this one for the audio
analysis, the design language, and the template.

## What's in the box

| Path | What | When to read |
|---|---|---|
| `scripts/analyze_audio.py` | Song to `analysis.json`: bands, events, beat grid, sections | Always, step 2 |
| `assets/template/` | Working Remotion project (3 scenes, trigger library, cues) | Always, step 1 |
| `references/gd-design-language.md` | The design philosophy, hit anatomy, section blueprint, ban list | **Before writing any visuals** |
| `references/recipes.md` | Code patterns: ripple, step-rotate, whiteout, parallax, particles, glitch... | When building scenes |
| `references/audio-analysis.md` | How the analysis works, weak spots, tuning | When the plot looks wrong |
| `references/remotion-gotchas.md` | Determinism, performance, audio sync, stills | When something renders oddly |

## Workflow

### 1. Set up the project

```bash
cp -r <skill-dir>/assets/template ./visualizer && cd visualizer
npm install
cp /path/to/song.mp3 public/song.mp3     # use the exact file you'll render with
mkdir -p scripts && cp <skill-dir>/scripts/analyze_audio.py scripts/
```
Template layout: `src/lib/` (analysis types, `fx.ts` trigger functions, palettes),
`src/scenes/` (rings, stars, portal), `src/choreography.ts` (**the file you edit**: cues),
`src/Visualizer.tsx` (camera, flash, dip, audio).

If the user only wants a Remotion *answer* and not a project, still follow steps 2 to 4 in
prose; don't skip the analysis.

### 2. Analyze the song

```bash
python3 scripts/analyze_audio.py public/song.mp3 --fps 60 \
        --out public/analysis.json --plot analysis-debug.png
```
(or `npm run analyze`.) Needs numpy, scipy, ffmpeg; matplotlib for the plot. **If you know the
BPM, add `--bpm N`**; autodetect is usually right but can be off by a ratio (2x, 2:3).

**Look at `analysis-debug.png`.** Check the section lines sit at the real changes, the kick
raster is empty in quiet parts, and BPM is plausible. Print output gives bpm, event counts
and section hints. Details and fixes: `references/audio-analysis.md`.

Choose fps now: **60** for the GD feel (hits resolve in 5 to 10 frames; at 30 fps they smear), 30 only
if the user needs smaller/faster files.

### 3. Study the reference (if the user gave one)

When the user provides a reference video, *look* at it before designing. Cheap and effective:

```bash
ffmpeg -v error -i ref.mp4 -vf "fps=1/4,scale=640:-1" frames/f_%03d.jpg   # a frame every 4 s
# build contact sheets (4x3 grids) with PIL and view them: structure, palettes, motifs
ffmpeg -v error -ss 44 -t 1.2 -i ref.mp4 -vf "fps=20,scale=480:-1" burst/b_%02d.jpg  # a hit, frame by frame
```
Then, in a few lines, write down: **(a)** the section structure and where the visuals change,
**(b)** the palette per section, **(c)** the 2 to 3 recurring motifs, **(d)** the anatomy of one
big hit (dip? flood? whiteout? how many frames?), **(e)** how long each setting lasts. Also
analyze the reference's *audio* with the same script to see how its visuals line up with the
song's energy. `references/gd-design-language.md` section 7 does this for Aperture; reuse its
format. Take approach and feel from the reference, never its art, characters or assets.

### 4. Write the visual brief (before code)

Write this as text to the user (and for yourself). It prevents the "everything is the same"
failure. Keep it to ~10 lines:

```
Mood:        <3 adjectives>
Motifs:      <2-3 shapes that recur: e.g. four-point sparkle, orbit rings, rounded windows>
Palettes:    paper (intro) / dusk (build) / night (drop) / ember (drop 2)   (4-5 colors each)
Sections:    bar 0-8 calm: rings/paper, punch 0.3
             bar 8-16 build: stars/dusk, punch 0.6, dip on bar 15
             bar 16- drop: portal/night, punch 1.2, whiteout on bar 16, swap scene every 8 bars
             ...
Hit anatomy: kick = zoom 3.5% + ring ripple + core flash (decays 5/8/14 frames)
             snare = quarter-turn on outer rings + 9px shake + streak
             hat = sparkle twinkle
Hero moment: <the one frame that should stop a viewer, usually the first drop hit>
```
If the user hasn't specified a style beyond "like Geometry Dash", pick for them from the song's
mood and say so; one clear choice beats a menu of questions.

### 5. Build

1. **Cues first.** Edit `src/choreography.ts`: set `CUES` (bars, scene, palette, punch). Start
   from the auto draft (`CUES = null`), render a few stills, then hand-write the list. Place
   scene changes on **downbeats**.
2. **Scenes.** Start from the three included, then add or replace scenes to match the brief.
   Use `references/recipes.md`. Give each scene a hero, at least four depth layers, and a
   distinct response per band: kick drives the hero, snare drives rotation/shake, hats drive sparkles.
3. **Palettes.** Add to `src/lib/palette.ts`. `glow` must be the brightest channel.
4. **Post.** Tune `Visualizer.tsx`: camera punch, flash, dip, vignette, optional letterbox.
5. Keep **every frame a pure function of `frame`** (see `references/remotion-gotchas.md`).

Rules of thumb (the numbers that make it feel right at 60 fps):
- Attack 0 frames. Decay 5 to 8 frames (flash), 8 to 12 (scale), 12 to 20 (line weight).
- Camera zoom <= 6%, shake <= 12 px. Hit gates: `minS` 0.35 to 0.6 so only real hits trigger big effects.
- Anticipation `dip` only before *big* events (cue boundaries), 4 to 6 frames, <= 0.55 opacity.
- Scene length 4 to 8 bars. Never change scene mid-bar.
- In quiet sections, reduce: fewer elements moving, lower punch. Let the drop be the contrast.

### 6. Verify with stills before rendering anything long

```bash
npx remotion still src/index.ts Visualizer out/a.png --frame=<kick f from analysis.json>
npx remotion still src/index.ts Visualizer out/b.png --frame=<same - 6>
```
View them. The kick frame must clearly differ from the one 6 frames earlier. Also check: first
frame, a calm frame, a drop-boundary frame (+0, +3, +15), a late frame, the last frame. Fix, then:

```bash
npm run render:draft   # 0.5 scale, quick check of the whole thing
npm run render         # final: 1080p60, h264, crf 16
```

### 7. Self-review against this rubric before delivering

- [ ] Can you tell sections apart *with the sound off*, by palette and density alone?
- [ ] Does the first drop hit have a dip before it and a flash on it?
- [ ] Is there at least one moment of near-stillness, so hits have contrast?
- [ ] Do the same 2 to 3 motifs recur across scenes?
- [ ] Do kick, snare and hat each visibly do a different thing?
- [ ] Is anything driven by a raw band level that should be an event? (jitter = yes)
- [ ] Any `Math.random`, CSS transition, or state that accumulates across frames? (must be none)
- [ ] Do cues land on downbeats?
- [ ] Is there a deliberate ending (whiteout, fade to the intro look, or end card), not a hard stop?

## Be honest about what you could and couldn't check

State what was verified: the audio analysis (you can run it and read the plot), the
types, and the stills you actually rendered and looked at. If you couldn't run a full render
(no network to install Remotion, no Chrome), say so plainly and ask the user to run
`npm run still` / `npm run render:draft` and report back what looks off. Do not claim a
visual result you haven't seen.

## Common requests

- **"Make it more like Geometry Dash"**: more events, fewer continuous mappings; add dip +
  whiteout at drops; palette per section; camera punch; step-rotations on snares; shorter scenes.
- **"It feels flat"**: add depth layers and parallax; add a second decay (stroke width); make the
  quiet parts quieter; widen palette contrast between sections.
- **"It's too busy"**: raise `minS`; fewer scenes per section; drop sparkle counts; cut shake.
- **"Hits feel late/early"**: check MP3 delay, re-analyze the exact render file, then apply a single
  `OFFSET` (frames) in `analysis.ts` (see gotchas).
- **Lyrics / title text**: use the typography slam recipe on downbeats; one font; never over a drop.
- **Vertical (9:16) or square**: change `width/height` in `Root.tsx`; scenes use `w`/`h`, but re-check
  ring radii (they use `h`) and move the hero off-center if needed.
