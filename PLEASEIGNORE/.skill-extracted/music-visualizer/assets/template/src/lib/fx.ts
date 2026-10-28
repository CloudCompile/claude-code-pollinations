// The "trigger" vocabulary, borrowed from Geometry Dash level editing.
// Each function answers: "given the events and the current frame, what value
// should this property have?" Stateless, deterministic, safe for parallel rendering.
import type { Ev } from "./analysis";
import { lastLE } from "./analysis";

// ---------- easings (GD's ease-out family does most of the work) ----------
export const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number, k = 1.70158) => 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);
export const easeOutElastic = (t: number) =>
  t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1;

// ---------- pulse: instant attack, exponential decay ----------
type HitOpts = { decay?: number; minS?: number; shift?: number };

/**
 * GD "Pulse trigger". Returns 0..1: jumps to the event strength the frame the
 * event lands, then decays. `decay` is a time constant in frames (6 = snappy at 60 fps).
 * `shift` delays the response (use it to stagger children into a ripple).
 * `minS` ignores weak events so only the real hits trigger the effect.
 */
export const hit = (evs: Ev[], frame: number, { decay = 6, minS = 0, shift = 0 }: HitOpts = {}): number => {
  const f = frame - shift;
  let i = lastLE(evs.map((e) => e.f), f); // small arrays; fine. For hot paths, hoist the map.
  let best = 0;
  for (; i >= 0; i--) {
    const dt = f - evs[i].f;
    if (dt > decay * 6) break;
    if (evs[i].s < minS) continue;
    best = Math.max(best, evs[i].s * Math.exp(-dt / decay));
  }
  return best;
};

/**
 * The anticipation dip: rises to 1 in the `lead` frames BEFORE an event.
 * Drive a brief darkening or a pull-back with it, then let hit() release it.
 * This dip-then-flash is what makes GD drops feel like they punch.
 */
export const dip = (evs: Ev[], frame: number, lead = 4, minS = 0): number => {
  const i = lastLE(evs.map((e) => e.f), frame);
  for (let j = i + 1; j < evs.length; j++) {
    if (evs[j].s < minS) continue;
    const d = evs[j].f - frame;
    if (d > lead) return 0;
    return evs[j].s * (1 - d / lead);
  }
  return 0;
};

/**
 * GD "Rotate/Move trigger on every hit". A number that climbs by 1.0 per event,
 * each step eased. Multiply by 90 for quarter-turns, by 40 for px of travel, etc.
 */
export const stepEase = (
  evs: Ev[],
  frame: number,
  { dur = 12, minS = 0, ease = easeOutExpo }: { dur?: number; minS?: number; ease?: (t: number) => number } = {}
): number => {
  const list = minS > 0 ? evs.filter((e) => e.s >= minS) : evs;
  const i = lastLE(list.map((e) => e.f), frame);
  if (i < 0) return 0;
  return i + ease(clamp01((frame - list[i].f) / dur));
};

/**
 * Turns a stepEase() counter into an eased back-and-forth: -amp, +amp, -amp... one flip per event.
 * Use for tilts and left/right snaps. (Do NOT use `% 2` on the raw counter; it saws instead of flipping.)
 */
export const flip = (v: number, amp: number): number => {
  const n = Math.floor(v);
  const state = (s: number) => (s % 2 === 0 ? -amp : amp);
  return state(n) + (state(n + 1) - state(n)) * (v - n);
};

/** Frames since the last event, capped. For "time since hit" animations. */
export const since = (evs: Ev[], frame: number, cap = 120): number => {
  const i = lastLE(evs.map((e) => e.f), frame);
  return i < 0 ? cap : Math.min(frame - evs[i].f, cap);
};

/** Integrate a per-frame speed into a position without state (prefix sums, build once). */
export const cumulative = (curve: number[], map: (v: number) => number = (v) => v): Float32Array => {
  const out = new Float32Array(curve.length);
  let acc = 0;
  for (let i = 0; i < curve.length; i++) { acc += map(curve[i]); out[i] = acc; }
  return out;
};
export const at = (arr: Float32Array | number[], frame: number): number =>
  arr.length === 0 ? 0 : arr[Math.min(Math.max(Math.round(frame), 0), arr.length - 1)];

// ---------- deterministic randomness (never Math.random in Remotion) ----------
export const rnd = (i: number, seed = 1): number => {
  let t = (Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
};
export const rndRange = (i: number, seed: number, lo: number, hi: number) => lo + rnd(i, seed) * (hi - lo);

/** GD "Shake trigger": per-frame jitter, amplitude in px. */
export const shake = (frame: number, amp: number, seed = 7): { x: number; y: number; r: number } => ({
  x: (rnd(frame, seed) - 0.5) * 2 * amp,
  y: (rnd(frame, seed + 1) - 0.5) * 2 * amp,
  r: (rnd(frame, seed + 2) - 0.5) * 2 * amp * 0.02,
});
