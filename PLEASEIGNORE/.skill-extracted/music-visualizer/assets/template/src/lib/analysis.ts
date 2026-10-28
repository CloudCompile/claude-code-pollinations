// Types + lookups for the JSON written by scripts/analyze_audio.py.
// Everything here is a pure function of (analysis, frame): no state, so Remotion
// can render frames in any order on any worker.

export type BandName = "sub" | "bass" | "lowmid" | "mid" | "highmid" | "air";
export type Ev = { f: number; s: number }; // frame, strength 0..1
export type Role = "calm" | "build" | "groove" | "drop";
export type Section = { start: number; end: number; intensity: number; role: Role };

export type Analysis = {
  version: number;
  fps: number;
  duration: number;
  durationInFrames: number;
  bpm: number;
  beatOffset: number;
  beats: number[];
  downbeats: number[];
  bands: Record<BandName, number[]>;
  env: Record<BandName, number[]>;
  slow: Record<BandName, number[]>;
  events: { kick: Ev[]; snare: Ev[]; hat: Ev[]; any: Ev[] };
  sections: Section[];
  energy: number[];
};

/** Linear-interpolated lookup into a per-frame curve. Safe at the edges. */
export const sample = (curve: number[], frame: number): number => {
  if (curve.length === 0) return 0;
  const f = Math.min(Math.max(frame, 0), curve.length - 1);
  const i = Math.floor(f);
  const j = Math.min(i + 1, curve.length - 1);
  return curve[i] + (curve[j] - curve[i]) * (f - i);
};

/** Index of the last element with arr[i] <= x, or -1. arr must be sorted. */
export const lastLE = (arr: number[], x: number): number => {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
};

/** Beats elapsed as a float: 12.0 = exactly on beat 12, 12.5 = halfway to 13. */
export const beatPos = (a: Analysis, frame: number): number => {
  const i = lastLE(a.beats, frame);
  if (i < 0) return 0;
  const period = a.beats[i + 1] !== undefined
    ? a.beats[i + 1] - a.beats[i]
    : (60 / a.bpm) * a.fps;
  return i + (frame - a.beats[i]) / period;
};

/** Bars elapsed as a float (4 beats per bar, downbeat-aligned). */
export const barPos = (a: Analysis, frame: number): number => {
  const i = lastLE(a.downbeats, frame);
  if (i < 0) return 0;
  const barLen = a.downbeats[i + 1] !== undefined
    ? a.downbeats[i + 1] - a.downbeats[i]
    : (240 / a.bpm) * a.fps;
  return i + (frame - a.downbeats[i]) / barLen;
};

/** Frame where bar number `bar` starts. Extrapolates past the ends. */
export const barToFrame = (a: Analysis, bar: number): number => {
  const barLen = (240 / a.bpm) * a.fps;
  if (a.downbeats.length === 0) return bar * barLen;
  if (bar < 0) return a.downbeats[0] + bar * barLen;
  if (bar >= a.downbeats.length) return a.downbeats[a.downbeats.length - 1] + (bar - a.downbeats.length + 1) * barLen;
  const i = Math.floor(bar);
  const next = a.downbeats[i + 1] ?? a.downbeats[i] + barLen;
  return a.downbeats[i] + (next - a.downbeats[i]) * (bar - i);
};

export const sectionAt = (a: Analysis, frame: number): Section =>
  a.sections.find((s) => frame >= s.start && frame < s.end) ??
  a.sections[a.sections.length - 1] ??
  { start: 0, end: a.durationInFrames, intensity: 0.5, role: "groove" };
