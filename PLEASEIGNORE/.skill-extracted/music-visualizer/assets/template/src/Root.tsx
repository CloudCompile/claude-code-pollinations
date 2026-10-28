import React from "react";
import { CalculateMetadataFunction, Composition, staticFile } from "remotion";
import { Props, Visualizer } from "./Visualizer";
import type { Analysis } from "./lib/analysis";

const SONG = "song.mp3"; // file in /public

// Duration, fps and the analysis JSON all come from the analysis step, so the video is
// exactly as long as the song and every frame number in the JSON lines up with the render.
const calculateMetadata: CalculateMetadataFunction<Props> = async ({ props, abortSignal }) => {
  const res = await fetch(staticFile("analysis.json"), { signal: abortSignal });
  if (!res.ok) throw new Error("public/analysis.json missing. Run: npm run analyze");
  const analysis = (await res.json()) as Analysis;
  return {
    durationInFrames: analysis.durationInFrames,
    fps: analysis.fps,
    props: { ...props, analysis },
  };
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Visualizer"
    component={Visualizer}
    width={1920}
    height={1080}
    fps={60}
    durationInFrames={60}
    defaultProps={{ song: SONG, analysis: null }}
    calculateMetadata={calculateMetadata}
  />
);
