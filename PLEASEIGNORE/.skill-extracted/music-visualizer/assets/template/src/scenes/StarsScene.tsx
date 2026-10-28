// Parallax starfield with constellation lines and sparkle stars. Calm, spacious, cheap to render.
// Speed follows loudness, twinkles follow hats, "shooting" streaks follow snares.
import React, { useMemo } from "react";
import { sample } from "../lib/analysis";
import { at, cumulative, hit, rnd, rndRange, since } from "../lib/fx";
import { alpha } from "../lib/palette";
import { Sparkle } from "./shapes";
import type { SceneProps } from "./types";

const COUNT = 160;
const LINKS = 9;

export const StarsScene: React.FC<SceneProps> = ({ a, frame, pal, w, h }) => {
  // Position is the integral of speed. Build prefix sums once, look up per frame.
  const travel = useMemo(() => cumulative(a.slow.bass, (v) => 0.6 + v * 5), [a]);
  const x0 = at(travel, frame);

  const stars = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => ({
      x: rnd(i, 11) * w, y: rnd(i, 12) * h, z: rndRange(i, 13, 0.15, 1), r: rndRange(i, 14, 0.8, 2.6),
    })),
    [w, h]
  );
  const pos = (s: (typeof stars)[number]) => ({
    x: (((s.x - x0 * s.z) % w) + w) % w,
    y: s.y + Math.sin((frame + s.x) * 0.01) * 4 * s.z,
  });

  const bright = stars.filter((_, i) => i % 18 === 0).slice(0, LINKS).map(pos);
  const snareSince = since(a.events.snare.filter((e) => e.s > 0.6), frame, 40);
  const kick = hit(a.events.kick, frame, { decay: 6, minS: 0.4 });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {/* constellation: thin lines between the brightest stars, brighter on kicks */}
      <polyline
        points={bright.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none" stroke={alpha(pal.line, 0.18 + kick * 0.5)} strokeWidth={1.2}
      />
      {stars.map((s, i) => {
        const p = pos(s);
        const tw = hit(a.events.hat, frame, { decay: 4, minS: 0.45, shift: (i % 13) * 0.7 });
        const big = i % 18 === 0;
        return big ? (
          <Sparkle key={i} x={p.x} y={p.y} r={10 + tw * 22 + kick * 6} color={pal.glow} opacity={0.65 + tw * 0.35} rot={0} />
        ) : (
          <circle key={i} cx={p.x} cy={p.y} r={s.r * (1 + tw * 1.4)} fill={pal.glow} opacity={0.25 + s.z * 0.5 + tw * 0.3} />
        );
      })}
      {/* snare streak: a line that shoots across and fades */}
      {snareSince < 40 && (
        <line
          x1={w * 0.2 + snareSince * 38} y1={h * 0.25 + snareSince * 6}
          x2={w * 0.2 + snareSince * 38 - 220} y2={h * 0.25 + snareSince * 6 - 34}
          stroke={pal.accent} strokeWidth={3} strokeLinecap="round" opacity={1 - snareSince / 40}
        />
      )}
      {/* horizon glow that rises with the level */}
      <rect x={0} y={h * 0.78} width={w} height={h * 0.22} fill={alpha(pal.accent2, 0.05 + sample(a.slow.lowmid, frame) * 0.2)} />
    </svg>
  );
};
