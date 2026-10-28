# Audio analysis: what the script does and how to trust it

`scripts/analyze_audio.py` turns a song into `analysis.json`. It uses only numpy + scipy +
ffmpeg so it runs in any sandbox. You read this file when the output looks wrong or you
need to tune it.

## Contents
1. Why not just use `visualizeAudio()`
2. What each output field is for
3. Reading the debug plot
4. Known weak spots and how to fix them
5. Tuning
6. Optional upgrades

## 1. Why not just use `visualizeAudio()`

Remotion's `visualizeAudio` gives linear-frequency FFT bins per frame. For music that means:
bass hogs the left bins, highs are dead on the right, values are jittery frame to frame,
and there are no *events*, only levels. It is fine for a quick waveform; it can't produce
GD-style choreography. The script instead computes, offline and once:

- **Log-spaced bands** (sub, bass, lowmid, mid, highmid, air), each **normalized
  independently** (8th to 99.5th percentile in dB) so hats matter as much as the kick, then a
  gamma of 1.6 so quiet passages go to true zero.
- **`env`**: instant attack + exponential release per band. This is the pulse shape from
  `gd-design-language.md` section 2, precomputed. Kicks get a 0.16-0.20 s tail, hats 0.06 s.
- **`slow`**: ~0.5 s low-pass of the same band. For things that should *drift*, not hit.
- **`events`**: onsets from adaptive-threshold spectral flux, split into `kick` (sub+bass),
  `snare` (mid+highmid), `hat` (air), `any`. Each has frame `f` (float) and strength `s` 0-1.
- **Beat grid**: `bpm`, `beats[]`, `downbeats[]` (bar starts), by autocorrelation then a fine
  search over tempo and phase. Downbeat phase picked by kick energy.
- **Sections**: bar-wise novelty with a checkerboard kernel over loudness + onset density.
  Each gets `intensity` 0-1 and a heuristic `role`.
- **`energy`**: overall loudness 0-1, smoothed.

All times are in **frames at the chosen fps**, so there's no seconds-to-frames conversion bug
at render time. Re-run with `--fps 30` for a 30 fps video; don't reuse a 60 fps JSON.

## 2. Which field for which job

| You want to... | Use |
|---|---|
| Flash / punch on a drum hit | `events.kick|snare|hat` with `hit()` |
| Rotate or move once per hit | `events.*` with `stepEase()` |
| Lock an orbit or ticker to the tempo | `beatPos()`, `barPos()` |
| Swap scene / palette | `sections` as a *draft*, then hand-written `CUES` in bars |
| Ambient swell (glow, fog, horizon) | `slow.*` or `energy` |
| Something that must feel "alive" at all times | `env.*` (small amplitude) |
| Speed that follows loudness | `cumulative(slow.bass, v => base + v*k)` then `at()` |

## 3. Reading the debug plot (`--plot debug.png`)

Three panels: band envelopes; energy with red lines at section starts; event raster with
grey bar lines. Check:

1. **Energy panel**: do the red lines sit at the obvious changes (drop, breakdown, outro)? If
   a visible cliff has no line near it, add a cue there by hand.
2. **Raster**: kick should look like a steady pattern in dense parts and be absent in the
   intro/breakdown. If kick is firing in quiet parts, the threshold is too low (raise `k`).
3. **Grey bar lines vs the kick pattern**: they should line up with the kick's main pulse.
   They won't align with every kick (syncopation is normal) but should not visibly walk away
   from the pulse over 30+ seconds.

Verify at least one thing by ear/eye: render a still on a strong kick `f` and one 6 frames
before; the first should be visibly brighter.

## 4. Known weak spots

- **The beat grid is a hint, the events are the truth.** The grid assumes a constant tempo. On
  tracks with tempo changes, swing, or rubato, `beats` drifts. Drive anything that must hit a
  drum from `events`; use the grid only for things that *loop* (orbits, bar counters, scene cuts).
  If the grid drifts, run the script on a trimmed segment per tempo and offset the frames.
- **Autodetected tempo can be wrong by a ratio** (2x, 1/2x, even 2:3). If you know the BPM
  (the user usually does, or it's in the track's metadata), **pass `--bpm N`**. The grid is then
  refined within +-3% of it. Always sanity check `bpm` against the track before building on it.
- **`snare` is "mid/high-mid transients", not only snares.** It also fires on claps, hats with
  body, and plucks. On a synthetic test with known hits, all real snares were found, but extra
  transients were too (it over-reports). `kick` was clean (all 48 of 48 real kicks, only a few
  extras). If the visual reacts to too many snare events, raise `minS` in `hit()` (0.6 to 0.8).
- **Half/double time**: a 76 BPM song may come out as 152 (or the reverse). `bpm` is folded
  into 85-175. For visuals this rarely matters; for bar-counting it shifts `bar` numbers by 2x.
  Check the bars in the plot against what you hear.
- **Section roles are heuristic.** `role` comes from loudness thresholds. A loud song with no
  quiet part will label everything `drop`. Treat as a draft.
- **Dense music (DnB, hardstyle, metal)**: kick/snare split gets muddy. Use a higher
  `minS` in `hit()` and fall back to `any` for generic punch.
- **Sparse/ambient music**: events will be few and soft; lean on `slow`/`energy` and
  the beat grid, and drive section changes by `sections`.
- **Mono mix-down**: the script analyzes mono. Stereo width is ignored.

## 5. Tuning

Edit constants at the top of `analyze_audio.py`:

- `BANDS` edges and release times: slower release (0.25 s) for floaty music, faster (0.08 s)
  for punchy.
- `pick_events(..., k=1.6)`: threshold = median + k*MAD. Raise to 2.2 for fewer, only-big
  events; lower to 1.2 for more.
- `min_gap_s`: kick 0.12, snare 0.15, hat 0.06. Raise for slower music.
- `normalize_db(gamma=1.6)`: raise to 2.0 for more silence-contrast, lower to 1.0 for flatter.
- `find_sections(min_bars=4, L=4)`: raise `min_bars` (6-8) for fewer, longer sections.

## 6. Optional upgrades (only if the user wants and the environment allows)

- **Stems** (`demucs`, `spleeter`): analyze drums/bass/vocals separately. Drum-stem kick/snare
  events are much cleaner, and vocal-stem onsets can drive typography. Run the same script per stem and
  merge into one JSON under different keys.
- **librosa**: `librosa.beat.beat_track` and `librosa.segment` can replace the grid and section
  code if it's installed; keep the same JSON shape so the template doesn't change.
- **Manual events**: for hero moments (the drop's first hit, a riser's peak), hand-add an event:
  `{"f": 1872, "s": 1}` in `events.kick`. A hand-placed event beats a detected one.
