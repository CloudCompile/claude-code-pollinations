# Remotion gotchas for audio-reactive work

Read alongside the Remotion skills already installed (`remotion-create`, `remotion-markup`,
`remotion-render`). This page only covers what bites *audio visualizers*.

## Determinism (the #1 source of broken renders)

Remotion renders frames in parallel, in any order, possibly on different machines. Therefore:

- **A frame must be a pure function of `frame` and props.** No `useState`/`useRef` that
  accumulates over frames, no mutating module-level variables, no "previous frame" reads.
- **No `Math.random()`, no `Date.now()`.** Use `rnd(i, seed)` from `lib/fx.ts`.
- **Integrate with prefix sums**, not with state: `cumulative(curve, fn)` once in `useMemo`,
  then `at(arr, frame)`.
- **Decays are computed from "frames since last event"**, which is stateless. That's how
  `hit()` works.

## One `useCurrentFrame()`, passed down

Call it once in `Visualizer.tsx` and pass `frame` to children as a prop. Calling it inside a
child that sits in a `<Sequence from={...}>` gives *local* frames, and the audio data would
misalign. `SceneProps.frame` is global; `SceneProps.local` is frames since the cue.

## Don't use

- CSS `transition`, `animation`, `@keyframes`, Tailwind `animate-*`: they won't render.
- `filter: blur()` / `drop-shadow()` on full-frame or many layers: slow, and can flicker
  between workers. Use `radialGradient` for glow, pre-blurred PNGs for depth of field.
- `localStorage`, network calls inside components. Fetch in `calculateMetadata`.
- `<canvas>` with persistent drawing (trails). Trails need previous frames. Fake them by
  drawing N past positions: for `k in 0..N`, position at `frame - k*2`, alpha falling off.

## Audio

- Use `<Audio src={staticFile("song.mp3")} />` from `@remotion/media`. Muxing into the MP4
  is automatic at render time.
- Put the song in `public/` and **analyze that exact file**. If you trim or re-encode the
  audio afterward, re-run the analysis; even 20 ms of different padding shifts every event.
- MP3 encoder delay: decoded MP3s start ~25 ms late in some decoders. If hits look late by a
  frame or two at 60 fps, add a constant `OFFSET` (frames) to events in `analysis.ts` and fix it
  in one place. If you convert once to WAV (`ffmpeg -i in.mp3 song.wav`) and use that file for
  both analysis and render, the offset disappears.
- To preview with the *video* length matching the song, fps and duration come from
  `analysis.json` via `calculateMetadata` (already wired).

## Performance

| Thing | Cost | Advice |
|---|---|---|
| 60 fps x 3 min | 10,800 frames | Use `npm run render:draft` (0.5 scale, crf 28) while iterating |
| Per-frame `evs.map(e => e.f)` in `hit()` | negligible (<1k events) | If you add 10k-event lists, hoist the arrays |
| SVG with <500 elements | fine | Thousands of elements: switch the scene to `<canvas>` |
| Big `analysis.json` | ~0.9 MB per 2 min | Fine. If >10 MB, drop `bands` (keep `env`, `slow`, `events`) |
| Concurrency | `remotion.config.ts` | ~half the CPU cores; raise carefully (RAM) |

## Checking your work without rendering everything

```bash
npx remotion still src/index.ts Visualizer out/kick.png --frame=2679      # a strong kick (see analysis.json)
npx remotion still src/index.ts Visualizer out/pre.png  --frame=2673      # 6 frames before: should be dimmer
npx remotion still src/index.ts Visualizer out/drop.png --frame=<cue.start>
```
Open the stills and compare. If kick vs pre don't differ visibly, the hit is too weak.
Always check: first frame, a quiet-section frame, a kick, a cue boundary, the last frame.

## Render

```bash
npm run render         # h264, crf 16, 1080p60
npx remotion render src/index.ts Visualizer out/v.mp4 --codec=h264 --crf=16 --pixel-format=yuv420p
```
`yuv420p` is the default and the right choice for upload sites. For a 4K master, change
`width/height` in `Root.tsx` (the scenes use `w`/`h` and scale) and expect ~4x render time.
