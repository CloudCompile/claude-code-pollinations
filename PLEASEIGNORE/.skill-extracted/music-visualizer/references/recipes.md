# Visual recipes

Copy-paste patterns built on `lib/fx.ts` and `lib/analysis.ts`. Each one lists the *feel* it
creates and the failure mode to avoid. All assume you're inside a scene component receiving
`a` (analysis), `frame` (global), `pal`, `w`, `h`.

## Contents
1. Hit stack (the one every scene needs)
2. Ripple (staggered response across children)
3. Step rotation (quarter-turn per snare)
4. Whiteout cut + anticipation dip
5. Camera punch
6. Parallax layers
7. Seeded particle burst
8. RGB split / glitch on a hit
9. Typography slam
10. Waveform ribbon
11. Tilted perspective sweep
12. Letterbox / frame border
13. Scene-per-section setpieces (ideas)

---

## 1. Hit stack

One hit, several properties, different decays. This is what makes a pulse feel physical.

```tsx
const flashK = hit(a.events.kick, frame, { decay: 5,  minS: 0.4 }); // brightness: fast
const scaleK = hit(a.events.kick, frame, { decay: 8,  minS: 0.4 }); // size: medium
const strokeK = hit(a.events.kick, frame, { decay: 14, minS: 0.4 }); // line weight: slower

<circle r={base * (1 + scaleK * 0.18)} fill={mix(pal.accent, pal.glow, flashK)}
        stroke={pal.line} strokeWidth={1.5 + strokeK * 4} />
```
Avoid: one `hit()` value reused for everything (looks like a single flicker).

## 2. Ripple

Children react in sequence, outermost last. Reads as a shockwave leaving the center.

```tsx
{rings.map((r, k) => {
  const p = hit(a.events.kick, frame, { decay: 8, minS: 0.35, shift: k * 2.2 });
  return <circle key={k} r={r * (1 + p * 0.035)} ... />;
})}
```
`shift` is in frames; 2 to 3 per child at 60 fps. More than ~4 looks like lag.

## 3. Step rotation

```tsx
const turns = stepEase(a.events.snare, frame, { dur: 14, minS: 0.5 });
<g transform={`rotate(${turns * 90} ${cx} ${cy})`}>...</g>        // quarter-turn per snare
<g transform={`rotate(${flip(turns, 3)} ${cx} ${cy})`}>...</g>    // alternating tilt
```
Alternate direction between layers (`dir = k % 2 ? 1 : -1`) for a mechanical, watch-gear feel.
Avoid `turns % 2` on the raw counter (it saws instead of flipping; use `flip`).

## 4. Whiteout cut + anticipation dip

Already wired in `Visualizer.tsx`. To add a bespoke one:

```tsx
const dropFrame = barToFrame(a, 32);
const pre  = dip([{ f: dropFrame, s: 1 }], frame, 6) * 0.6;      // 6 frames of darkening
const post = hit([{ f: dropFrame, s: 1 }], frame, { decay: 9 }); // whiteout decay
<Dip amount={pre} />  <Flash amount={post} color="#fff" />
```
For a bigger drop, dip over a whole bar (`lead = barLen`) *with a riser*: scale the scene
down slowly (`1 - 0.08 * ramp`), then release with the flash and a zoom to `1.06`.

## 5. Camera punch

```tsx
const kick = hit(a.events.kick, frame, { decay: 6, minS: 0.4 });
const sn   = hit(a.events.snare, frame, { decay: 4, minS: 0.55 });
const sh   = shake(frame, sn * 9 * punch);
style={{ scale: String(1 + kick * 0.035 * punch),
         translate: `${sh.x}px ${sh.y}px`, rotate: `${sh.r}deg` }}
```
Keep zoom under 6% and shake under 12 px at 1080p. Above that it reads as a bug.

## 6. Parallax layers

```tsx
const travel = useMemo(() => cumulative(a.slow.bass, (v) => 0.6 + v * 5), [a]); // px/frame
const x0 = at(travel, frame);
layers.forEach(l => x = (((l.x - x0 * l.z) % w) + w) % w);   // l.z: 0.15 (far) .. 1 (near)
```
Integrate speed (prefix sums); never `frame * speed(frame)`, which makes motion jump when speed changes.

## 7. Seeded particle burst

```tsx
const e = lastLE(a.events.snare.map(x => x.f), frame);        // most recent snare
const age = e >= 0 ? frame - a.events.snare[e].f : 999;
if (age < 40) for (let i = 0; i < 24; i++) {
  const ang = rnd(i, e) * Math.PI * 2;                         // seeded by hit index: same every render
  const spd = rndRange(i, e + 99, 4, 14);
  const x = cx + Math.cos(ang) * spd * age * (1 - age / 80);   // slows down
  const y = cy + Math.sin(ang) * spd * age + 0.25 * age * age; // gravity
  <circle cx={x} cy={y} r={3 * (1 - age / 40)} fill={pal.accent} />
}
```
Seed with the *event index*, so each burst differs but is reproducible.

## 8. RGB split / glitch

Draw the hero three times with `mix-blend-mode: screen`, in R, G, B, offset by the hit:

```tsx
const g = hit(a.events.snare, frame, { decay: 3, minS: 0.6 });
{["#ff0040", "#00ff80", "#0060ff"].map((c, i) => (
  <g key={c} style={{ mixBlendMode: "screen" }} transform={`translate(${(i - 1) * g * 14} 0)`}>
    <Hero color={c} />
  </g>
))}
```
Use only on hard hits and short (3 frames). Constant glitch is noise.

## 9. Typography slam

```tsx
const t = since(hitsList, frame, 60);               // frames since the downbeat
const s = easeOutBack(clamp01(t / 10));             // overshoot, settle
const out = clamp01((t - 40) / 8);                  // exit
<div style={{ scale: String(0.6 + 0.4 * s), opacity: (1 - out) * clamp01(t / 2) }}>TITLE</div>
```
One word per downbeat at most. Fonts via `@remotion/google-fonts` or `staticFile` with `FontFace`
(see the Remotion google-fonts / local-fonts skill pages).

## 10. Waveform ribbon

Build from the `env` bands rather than raw samples: sample 5 bands at `frame - k*3` for k in
0..N and join with a smooth path. You get a ribbon that scrolls and reacts without needing
raw PCM in the browser.

```tsx
const pts = Array.from({ length: 64 }, (_, k) => {
  const f = frame - (63 - k) * 1.5;
  const y = h / 2 - (sample(a.env.mid, f) * 0.6 + sample(a.env.bass, f) * 0.4) * h * 0.25;
  return `${(k / 63) * w},${y}`;
});
<polyline points={pts.join(" ")} fill="none" stroke={pal.accent} strokeWidth={3} />
```

## 11. Tilted perspective sweep

```tsx
<div style={{ perspective: 1400, position: "absolute", inset: 0 }}>
  <div style={{ transformStyle: "preserve-3d",
                transform: `rotateY(${-14 + sample(a.slow.bass, frame) * 6}deg) rotateX(4deg)` }}>
    {children}
  </div>
</div>
```
Drift the rotateY slowly with `barPos` for a camera sweep; snap it with `flip()` on downbeats.

## 12. Letterbox / frame border

```tsx
const bars = h * 0.065 * ease;           // ease in at section start, on cue
<div style={{ position:"absolute", left:0, right:0, top:0, height:bars, background:"#000",
              borderBottom:`2px solid ${pal.accent2}` }} />   // (and the mirror at the bottom)
```
A thin accent border on the bars is a cheap way to say "premium".

## 13. Scene-per-section setpieces (ideas)

A scene should be a *place* with one hero and a clear reaction. Starting points; invent more
per song:

- **Observatory**: dark room silhouette layers, warm lamp (slow flicker from `slow.lowmid`), a
  big window with a blue orb that pulses on kick, constellation lines on hats.
- **Astrolabe**: stacked gold rings counter-rotating, step-rotate on snare, a bright core.
- **Film strip**: row of rounded windows scrolling; each shows a different scene color; kick
  advances the strip one window with `easeOutBack`.
- **Tunnel**: `PortalScene` (kick-driven zoom lurch).
- **Paper diagram**: cream background, ink line-art, ticked rings, pencil handwriting
  appearing with a `clipPath` wipe on bars; hits are small gold dots.
- **Stage lights**: beams (rotated gradient rects) sweeping with `barPos`, intensity with `energy`.
- **City / skyline**: parallax silhouettes, windows lighting up on hats, sky color from the palette.
- **Grid floor** (synthwave-ish): perspective grid scrolling with integrated bass speed.
