// Nested rounded-rectangle "film windows" rushing at the camera. The drop scene.
// Kicks shove the zoom forward (integral of a spiky speed curve), snares flip the tilt.
import React, { useMemo } from "react";
import { sample } from "../lib/analysis";
import { at, cumulative, flip, hit, stepEase } from "../lib/fx";
import { alpha, mix } from "../lib/palette";
import { Sparkle } from "./shapes";
import type { SceneProps } from "./types";

const LAYERS = 9;

export const PortalScene: React.FC<SceneProps> = ({ a, frame, pal, w, h }) => {
  // speed = base + bass level + a spike on each kick -> zoom lurches forward on the beat
  const kickCurve = useMemo(() => {
    const c = new Array(a.durationInFrames).fill(0);
    for (const e of a.events.kick) {
      if (e.s < 0.35) continue;
      for (let k = 0; k < 14; k++) {
        const i = Math.round(e.f) + k;
        if (i < c.length) c[i] += e.s * Math.exp(-k / 4);
      }
    }
    return c;
  }, [a]);
  const travel = useMemo(
    () => cumulative(a.env.bass.map((v, i) => 0.004 + v * 0.006 + kickCurve[i] * 0.012)),
    [a, kickCurve]
  );
  const t = at(travel, frame);
  const tilt = flip(stepEase(a.events.snare, frame, { dur: 10, minS: 0.55 }), 3); // flips +-3 deg per snare
  const cx = w / 2, cy = h / 2;
  const flash = hit(a.events.kick, frame, { decay: 5, minS: 0.4 });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <g transform={`rotate(${tilt} ${cx} ${cy})`}>
        {Array.from({ length: LAYERS }, (_, k) => {
          const s = (((k + t * LAYERS) % LAYERS) + LAYERS) % LAYERS / LAYERS; // 0 (far) -> 1 (near)
          const size = 0.04 + s * s * 1.9;
          const rw = w * size, rh = h * size;
          const op = Math.sin(Math.PI * s) * (0.35 + flash * 0.5);
          const col = mix(pal.line, pal.accent, (k % 3) / 3 + flash * 0.3);
          return (
            <rect
              key={k} x={cx - rw / 2} y={cy - rh / 2} width={rw} height={rh}
              rx={Math.min(rw, rh) * 0.12} fill="none" stroke={col}
              strokeWidth={1.5 + s * 5} opacity={op}
            />
          );
        })}
      </g>
      {/* core: tiny bright window you are falling into */}
      <circle cx={cx} cy={cy} r={h * (0.02 + flash * 0.02)} fill={pal.glow} opacity={0.9} />
      {[0, 1, 2, 3].map((i) => {
        const ang = (i * Math.PI) / 2;
        const d = h * (0.09 + flash * 0.05);
        return <Sparkle key={i} x={cx + Math.cos(ang) * d} y={cy + Math.sin(ang) * d} r={10 + flash * 22} color={pal.glow} />;
      })}
      <rect x={0} y={h * 0.9} width={w} height={h * 0.1} fill={alpha(pal.accent2, 0.1 + sample(a.env.sub, frame) * 0.3)} />
    </svg>
  );
};
