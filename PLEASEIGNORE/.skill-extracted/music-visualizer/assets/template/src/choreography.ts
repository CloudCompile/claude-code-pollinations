// THE FILE YOU EDIT. This is the level's "trigger list": which scene and palette play
// from which bar, and how hard the camera punches. Musical time (bars), not seconds,
// so cues stay glued to the song if you re-analyze at a different fps.
//
// Leave CUES = null to auto-generate from detected sections (a decent first draft).
// Then look at analysis-debug.png + a few stills and rewrite by hand: auto cues find
// WHERE the music changes, only you can decide WHAT each section should feel like.
import { Analysis, barToFrame, lastLE } from "./lib/analysis";
import { PALETTES } from "./lib/palette";

export type SceneId = "rings" | "stars" | "portal";
export type Cue = {
  bar: number;                 // bar index (0 = first downbeat). Fractions allowed.
  scene: SceneId;
  palette: keyof typeof PALETTES;
  punch?: number;              // 0..1.5 camera zoom / shake / flash intensity (default 1)
};

export const CUES: Cue[] | null = null;
/* Example of a hand-written list (bars are positions in the song, not seconds):
export const CUES: Cue[] = [
  { bar: 0,  scene: "rings",  palette: "paper", punch: 0.3 },  // sparse intro
  { bar: 8,  scene: "stars",  palette: "dusk",  punch: 0.6 },  // build
  { bar: 16, scene: "portal", palette: "night", punch: 1.2 },  // drop 1
  { bar: 24, scene: "rings",  palette: "night", punch: 1.2 },
  { bar: 32, scene: "portal", palette: "ember", punch: 1.4 },  // drop 2
  { bar: 48, scene: "stars",  palette: "paper", punch: 0.3 },  // breakdown
];
*/

export type ResolvedCue = Cue & { start: number; end: number; index: number };

const snapToBar = (a: Analysis, frame: number): number => {
  if (a.downbeats.length === 0) return 0;
  let best = 0, bd = Infinity;
  a.downbeats.forEach((d, i) => { const dd = Math.abs(d - frame); if (dd < bd) { bd = dd; best = i; } });
  return best;
};

export const autoCues = (a: Analysis): Cue[] => {
  const out: Cue[] = [];
  let drops = 0;
  a.sections.forEach((s) => {
    const bar0 = snapToBar(a, s.start);
    const bar1 = snapToBar(a, s.end);
    const len = Math.max(bar1 - bar0, 1);
    const variants: Cue[] =
      s.role === "calm" ? [{ bar: 0, scene: "rings", palette: "paper", punch: 0.35 }] :
      s.role === "build" ? [{ bar: 0, scene: "stars", palette: "dusk", punch: 0.6 }] :
      s.role === "groove" ? [{ bar: 0, scene: "stars", palette: "dusk", punch: 0.8 }, { bar: 0, scene: "rings", palette: "dusk", punch: 0.8 }] :
      drops++ % 2 === 0
        ? [{ bar: 0, scene: "portal", palette: "night", punch: 1.2 }, { bar: 0, scene: "rings", palette: "night", punch: 1.2 }]
        : [{ bar: 0, scene: "portal", palette: "ember", punch: 1.3 }, { bar: 0, scene: "rings", palette: "ember", punch: 1.3 }];
    // long sections: swap scene every 8 bars so nothing sits still for 20+ seconds
    const step = len > 16 ? 8 : len;
    for (let b = 0, k = 0; b < len; b += step, k++) {
      out.push({ ...variants[k % variants.length], bar: bar0 + b });
    }
  });
  return out.length ? out : [{ bar: 0, scene: "rings", palette: "dusk" }];
};

export const resolveCues = (a: Analysis, cues: Cue[] | null): ResolvedCue[] => {
  const list = [...(cues ?? autoCues(a))].sort((x, y) => x.bar - y.bar);
  return list.map((c, i) => ({
    ...c,
    index: i,
    start: i === 0 ? 0 : barToFrame(a, c.bar),
    end: i + 1 < list.length ? barToFrame(a, list[i + 1].bar) : a.durationInFrames + 1,
  }));
};

export const cueAtFrame = (cues: ResolvedCue[], frame: number): ResolvedCue => {
  const i = lastLE(cues.map((c) => c.start), frame);
  return cues[Math.max(i, 0)];
};
