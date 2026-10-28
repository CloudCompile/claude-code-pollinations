import type { Analysis } from "../lib/analysis";
import type { Palette } from "../lib/palette";

export type SceneProps = {
  a: Analysis;
  frame: number;   // GLOBAL frame. Never call useCurrentFrame() in children (see references/remotion-gotchas.md)
  local: number;   // frames since this scene's cue started (for entrance animations)
  pal: Palette;
  w: number;
  h: number;
};
