// Orbit-diagram scene: concentric rings, planets locked to the beat grid, a sun that kicks.
// Reads like an astronomy chart that is alive. Good for calm / build sections and breakdowns.
import React from "react";
import { barPos, beatPos, sample } from "../lib/analysis";
import { hit, stepEase, easeOutExpo } from "../lib/fx";
import { alpha, mix } from "../lib/palette";
import { Glow, Sparkle } from "./shapes";
import type { SceneProps } from "./types";

const N = 7;

export const RingsScene: React.FC<SceneProps> = ({ a, frame, local, pal, w, h }) => {
  const cx = w / 2, cy = h / 2;
  const kick = hit(a.events.kick, frame, { decay: 7, minS: 0.35 });
  const snareTurn = stepEase(a.events.snare, frame, { dur: 14, minS: 0.5 }); // +1 per snare
  const hat = (shift: number) => hit(a.events.hat, frame, { decay: 5, minS: 0.4, shift });
  const beats = beatPos(a, frame);
  const bars = barPos(a, frame);
  const intro = easeOutExpo(Math.min(local / 24, 1)); // rings expand in on cue

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <Glow id="sun" color={pal.accent} />
        <Glow id="halo" color={pal.glow} />
      </defs>

      {/* big soft halo behind everything, breathes with the bass */}
      <circle cx={cx} cy={cy} r={h * (0.55 + sample(a.slow.bass, frame) * 0.12)} fill="url(#halo)" opacity={0.10 + kick * 0.12} />

      {Array.from({ length: N }, (_, k) => {
        // Ripple: each ring reacts a few frames after the one inside it.
        const ripple = hit(a.events.kick, frame, { decay: 8, minS: 0.35, shift: k * 2.2 });
        const r = h * (0.10 + k * 0.066) * intro * (1 + ripple * 0.035);
        const dir = k % 2 === 0 ? 1 : -1;
        // slow constant drift + a quarter-turn eased on every strong snare, alternating direction
        const rot = dir * (frame * 0.05 * (1 + k * 0.15) + snareTurn * (k % 3 === 0 ? 90 : 30));
        const dashed = k % 2 === 1;
        const circ = 2 * Math.PI * r;
        return (
          <g key={k} transform={`rotate(${rot} ${cx} ${cy})`}>
            <circle
              cx={cx} cy={cy} r={r} fill="none"
              stroke={mix(pal.line, pal.accent, ripple * 0.8)}
              strokeWidth={1.2 + ripple * 2.2}
              strokeDasharray={dashed ? `2 ${Math.max(circ / 160, 6)}` : undefined}
              opacity={0.55 + ripple * 0.45}
            />
            {/* planet: completes one orbit every 4*(k+1) beats, so it is always on the grid */}
            {(() => {
              const ang = ((beats / (4 * (k + 1))) * Math.PI * 2 * dir) + k * 1.3;
              const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r;
              const pr = 5 + (k % 3) * 3 + hat(k * 1.5) * 8;
              return <circle cx={px} cy={py} r={pr} fill={k % 2 ? pal.accent2 : pal.accent} opacity={0.95} />;
            })()}
          </g>
        );
      })}

      {/* the sun */}
      <circle cx={cx} cy={cy} r={h * 0.20 * (0.55 + kick * 0.16)} fill="url(#sun)" opacity={0.9} />
      <circle cx={cx} cy={cy} r={h * 0.035 * (1 + kick * 0.45)} fill={pal.glow} />

      {/* four sparkles that cross-hair the sun; they twinkle on hats and spin on bars */}
      {[0, 1, 2, 3].map((i) => {
        const ang = (i * Math.PI) / 2 + Math.PI / 4 + bars * 0.4;
        const d = h * (0.25 + 0.05 * i);
        const t = hat(i * 3);
        return <Sparkle key={i} x={cx + Math.cos(ang) * d} y={cy + Math.sin(ang) * d} r={14 + t * 30} color={pal.glow} rot={bars * 45} opacity={0.5 + t * 0.5} />;
      })}

      {/* thin crosshair lines: the "diagram" feel */}
      <g stroke={alpha(pal.line, 0.35)} strokeWidth={1}>
        <line x1={cx} y1={0} x2={cx} y2={h} />
        <line x1={0} y1={cy} x2={w} y2={cy} />
      </g>
    </svg>
  );
};
