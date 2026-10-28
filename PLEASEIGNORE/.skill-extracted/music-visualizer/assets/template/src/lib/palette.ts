// GD works in color "channels" (BG, line, accent, glow...) that triggers swap on cue.
// A palette is one full set of channels. Keep to 4-5 hues max per palette; the pulse
// moves a channel toward `glow`/white, so make sure `glow` is the brightest thing in it.

export type Palette = {
  bg: string;      // far background
  bg2: string;     // second stop of the background gradient
  line: string;    // thin line-art, orbits, grids
  accent: string;  // the one color that means "hit"
  accent2: string; // secondary accent
  glow: string;    // flash / bloom color
  ink: string;     // contrast color for shapes drawn on top of the glow
};

export const PALETTES: Record<string, Palette> = {
  // warm paper + ink + gold: calm, diagram-like (intro / breakdown)
  paper: { bg: "#efe6d0", bg2: "#d9c9a8", line: "#6b6074", accent: "#d99a2b", accent2: "#c2557a", glow: "#fffaf0", ink: "#2b2433" },
  // violet to pink dusk: building tension
  dusk: { bg: "#1b0f3d", bg2: "#6b2f93", line: "#c9a8ff", accent: "#ff7ac6", accent2: "#ffd36b", glow: "#ffe9fb", ink: "#12082b" },
  // near-black with a blue orb and warm lamp: the drop
  night: { bg: "#06060f", bg2: "#14153a", line: "#7fa8ff", accent: "#5aa7ff", accent2: "#ffb35a", glow: "#e8f2ff", ink: "#04040a" },
  // hot variant for a second drop
  ember: { bg: "#12060a", bg2: "#4a1020", line: "#ff9a7a", accent: "#ff4d5e", accent2: "#ffd36b", glow: "#fff1e6", ink: "#0d0306" },
};

const h2r = (h: string): [number, number, number] => {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
const r2h = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

/** Blend two hex colors. t=0 -> a, t=1 -> b. */
export const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = h2r(a);
  const [br, bg, bb] = h2r(b);
  return r2h(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
};
export const alpha = (hex: string, a: number): string => {
  const [r, g, b] = h2r(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/** Cross-fade two palettes channel by channel (use for the 1-2 frames around a cue). */
export const mixPalette = (a: Palette, b: Palette, t: number): Palette => ({
  bg: mix(a.bg, b.bg, t), bg2: mix(a.bg2, b.bg2, t), line: mix(a.line, b.line, t),
  accent: mix(a.accent, b.accent, t), accent2: mix(a.accent2, b.accent2, t),
  glow: mix(a.glow, b.glow, t), ink: mix(a.ink, b.ink, t),
});
