// Full-frame overlays: the "last 10%" that makes a hit feel like a hit.
import React from "react";
import type { Palette } from "./lib/palette";
import { alpha } from "./lib/palette";

/** Additive flash. `amount` 0..1. Uses screen blending so dark scenes bloom instead of washing out. */
export const Flash: React.FC<{ amount: number; color: string }> = ({ amount, color }) =>
  amount <= 0.002 ? null : (
    <div style={{ position: "absolute", inset: 0, background: color, opacity: Math.min(amount, 1), mixBlendMode: "screen" }} />
  );

/** Anticipation dip: a brief darkening right before a hit makes the hit read brighter. */
export const Dip: React.FC<{ amount: number }> = ({ amount }) =>
  amount <= 0.002 ? null : <div style={{ position: "absolute", inset: 0, background: "#000", opacity: Math.min(amount, 1) }} />;

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <div
    style={{
      position: "absolute", inset: 0, pointerEvents: "none",
      background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

export const Background: React.FC<{ pal: Palette; lift: number }> = ({ pal, lift }) => (
  <div
    style={{
      position: "absolute", inset: 0,
      background: `radial-gradient(ellipse at 50% 55%, ${alpha(pal.bg2, 0.55 + lift * 0.45)} 0%, ${pal.bg} 75%)`,
    }}
  />
);
