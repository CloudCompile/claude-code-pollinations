import React from "react";

/** Four-point concave star: the sparkle motif. Draws centered at (0,0). */
export const sparklePath = (r: number, pinch = 0.12): string => {
  const c = r * pinch;
  return `M0,${-r} Q${c},${-c} ${r},0 Q${c},${c} 0,${r} Q${-c},${c} ${-r},0 Q${-c},${-c} 0,${-r}Z`;
};

export const Sparkle: React.FC<{ x: number; y: number; r: number; color: string; rot?: number; opacity?: number }> = ({
  x, y, r, color, rot = 0, opacity = 1,
}) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`} opacity={opacity}>
    <path d={sparklePath(r)} fill={color} />
  </g>
);

/** Soft glow without CSS blur (blur filters are slow and flicker across frames). */
export const Glow: React.FC<{ id: string; color: string; inner?: number }> = ({ id, color, inner = 0 }) => (
  <radialGradient id={id}>
    <stop offset={`${inner * 100}%`} stopColor={color} stopOpacity={0.9} />
    <stop offset="100%" stopColor={color} stopOpacity={0} />
  </radialGradient>
);
