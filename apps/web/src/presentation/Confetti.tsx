import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { cssToken } from '../theme/cssToken';

export interface ConfettiHandle {
  /** draw the burst `ms` after it started (null clears) — called from the render loop */
  draw: (ms: number | null) => void;
}

export const CONFETTI_MS = 1300;
const COUNT = 70;
/** particles stay in the outer bands of the screen: never over the model centre */
export const SIDE_BAND = 0.28;

export interface Piece {
  /** start x as a fraction of the width (inside a side band) */
  x: number;
  /** start y as a fraction of the height (upper part) */
  y: number;
  /** horizontal drift (fraction of width / s), always towards the nearest screen edge */
  vx: number;
  vy: number;
  size: number;
  spin: number;
  color: number;
}

/** Deterministic pseudo-random (mulberry32): the same burst every time, testable. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small particles from the upper left and right sides, drifting outwards and down. */
export function makePieces(): Piece[] {
  const r = rng(7);
  return Array.from({ length: COUNT }, (_, i) => {
    const left = i % 2 === 0;
    const x = left ? 0.02 + r() * (SIDE_BAND - 0.08) : 1 - 0.02 - r() * (SIDE_BAND - 0.08);
    return {
      x,
      y: 0.04 + r() * 0.22,
      vx: (left ? -1 : 1) * (0.01 + r() * 0.05),
      vy: -0.15 - r() * 0.25,
      size: 0.004 + r() * 0.004,
      spin: (r() - 0.5) * 12,
      color: Math.floor(r() * 3),
    };
  });
}

/** Position of a piece `s` seconds after the burst (fractions of width / height). */
export function piecePosition(p: Piece, s: number): { x: number; y: number } {
  return { x: p.x + p.vx * s, y: p.y + p.vy * s + 0.6 * s * s };
}

/**
 * Restrained celebration: one short burst (~1.3 s) of small particles (#009FE3 / #20B85A /
 * #FFFFFF tokens) from the upper sides of the 3D zone, never over the model centre. No own
 * animation loop: the reveal driver calls draw(ms) from the existing render loop.
 */
export const Confetti = forwardRef<ConfettiHandle>(function Confetti(_props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pieces = useRef<Piece[]>(makePieces());
  const colors = useRef<string[]>([]);

  useEffect(() => {
    colors.current = [
      cssToken('--particle-1', '#009fe3'),
      cssToken('--particle-2', '#20b85a'),
      cssToken('--particle-3', '#ffffff'),
    ];
  }, []);

  useImperativeHandle(ref, () => ({
    draw: (ms) => {
      const c = canvas.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      if (ms === null || ms >= CONFETTI_MS) return;
      const s = ms / 1000;
      ctx.globalAlpha = Math.min(1, (CONFETTI_MS - ms) / 350);
      for (const p of pieces.current) {
        const pos = piecePosition(p, s);
        const size = p.size * Math.max(w, h);
        ctx.save();
        ctx.translate(pos.x * w, pos.y * h);
        ctx.rotate(p.spin * s);
        ctx.fillStyle = colors.current[p.color] ?? '#009fe3';
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  }));

  return <canvas ref={canvas} className="confetti" aria-hidden="true" />;
});
