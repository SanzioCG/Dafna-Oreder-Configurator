import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { cssToken } from '../theme/cssToken';

export interface ConfettiHandle {
  /** draw the burst `ms` after it started (null clears) — called from the render loop */
  draw: (ms: number | null) => void;
}

export const CONFETTI_MS = 1500;
const COUNT = 90;

interface Piece {
  x: number;
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

function makePieces(): Piece[] {
  const r = rng(7);
  return Array.from({ length: COUNT }, () => ({
    x: 0.2 + r() * 0.6,
    vx: (r() - 0.5) * 0.5,
    vy: -0.9 - r() * 0.7,
    size: 0.006 + r() * 0.006,
    spin: (r() - 0.5) * 14,
    color: Math.floor(r() * 4),
  }));
}

/**
 * Restrained celebration: one short burst (~1.5 s) of brand-coloured paper pieces on a 2D
 * canvas over the 3D zone. No own animation loop: the reveal driver calls draw(ms) from the
 * existing render loop. pointer-events: none.
 */
export const Confetti = forwardRef<ConfettiHandle>(function Confetti(_props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pieces = useRef<Piece[]>(makePieces());
  const colors = useRef<string[]>([]);

  useEffect(() => {
    colors.current = [
      cssToken('--brand-blue', '#009fe2'),
      cssToken('--success', '#20b85a'),
      cssToken('--brand-blue-hover', '#30bbf9'),
      cssToken('--warning', '#f4980f'),
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
      const fade = Math.min(1, (CONFETTI_MS - ms) / 400);
      ctx.globalAlpha = fade;
      for (const p of pieces.current) {
        const x = (p.x + p.vx * s) * w;
        const y = (0.42 + p.vy * s + 1.1 * s * s) * h;
        const size = p.size * Math.max(w, h);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.spin * s);
        ctx.fillStyle = colors.current[p.color] ?? '#009fe2';
        ctx.fillRect(-size / 2, -size / 4, size, size / 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  }));

  return <canvas ref={canvas} className="confetti" aria-hidden="true" />;
});
