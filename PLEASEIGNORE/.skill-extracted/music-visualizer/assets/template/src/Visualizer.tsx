import React, { useMemo } from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Analysis, sample } from "./lib/analysis";
import { dip, hit, shake } from "./lib/fx";
import { PALETTES } from "./lib/palette";
import { CUES, cueAtFrame, resolveCues } from "./choreography";
import { Background, Dip, Flash, Vignette } from "./Post";
import { PortalScene } from "./scenes/PortalScene";
import { RingsScene } from "./scenes/RingsScene";
import { StarsScene } from "./scenes/StarsScene";

export type Props = { song: string; analysis: Analysis | null };

const SCENES = { rings: RingsScene, stars: StarsScene, portal: PortalScene } as const;

export const Visualizer: React.FC<Props> = ({ song, analysis }) => {
  // ONE useCurrentFrame() for the whole tree; children get it as a prop.
  const frame = useCurrentFrame();
  const { width: w, height: h } = useVideoConfig();
  const cues = useMemo(() => (analysis ? resolveCues(analysis, CUES) : []), [analysis]);
  if (!analysis) return null;

  const a = analysis;
  const cue = cueAtFrame(cues, frame);
  const next = cues[cue.index + 1];
  const pal = PALETTES[cue.palette];
  const punch = cue.punch ?? 1;
  const Scene = SCENES[cue.scene];

  // --- camera: zoom on kicks, jitter on snares (both scaled by the cue's punch)
  const kick = hit(a.events.kick, frame, { decay: 6, minS: 0.4 });
  const snare = hit(a.events.snare, frame, { decay: 4, minS: 0.55 });
  const sh = shake(frame, snare * 9 * punch);
  const zoom = 1 + kick * 0.035 * punch;

  // --- transitions: dip just before a cue, whiteout flash on it (hard cut, GD style)
  const boundary = [{ f: cue.start, s: 1 }];
  const cutFlash = cue.index === 0 ? 0 : hit(boundary, frame, { decay: 7 });
  const preDip = next ? dip([{ f: next.start, s: 1 }], frame, 5) * 0.55 : 0;

  // --- accent flash on strong kicks, kept subtle so the scene stays readable
  const kickFlash = hit(a.events.kick, frame, { decay: 5, minS: 0.7 }) * 0.16 * punch;

  return (
    <AbsoluteFill style={{ backgroundColor: pal.bg, overflow: "hidden" }}>
      <Audio src={staticFile(song)} />
      <AbsoluteFill
        style={{
          translate: `${sh.x}px ${sh.y}px`,
          rotate: `${sh.r}deg`,
          scale: String(zoom),
        }}
      >
        <Background pal={pal} lift={sample(a.slow.bass, frame)} />
        <Scene a={a} frame={frame} local={frame - cue.start} pal={pal} w={w} h={h} />
      </AbsoluteFill>
      <Vignette />
      <Flash amount={kickFlash} color={pal.glow} />
      <Flash amount={cutFlash * 0.95} color="#ffffff" />
      <Dip amount={preDip} />
    </AbsoluteFill>
  );
};
