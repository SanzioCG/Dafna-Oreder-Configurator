import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { cssToken } from '../theme/cssToken';
import { LOGO_URL } from '../theme/ThemeProvider';

export interface ConfettiHandle {
  /** draw the burst `ms` after it started (null clears) — called from the render loop */
  draw: (ms: number | null) => void;
}

export const CONFETTI_MS = 2600;
const COUNT = 200;
/** every n-th candy is a white "logo candy" carrying the DAFNA logo */
export const LOGO_EVERY = 4;
/** dafna-logo.svg aspect ratio (3969 × 1287) */
const LOGO_ASPECT = 3969 / 1287;

export interface Piece {
  /** start x as a fraction of the width (anywhere across the screen) */
  x: number;
  /** start y as a fraction of the height (just above the top edge) */
  y: number;
  /** horizontal drift (fraction of width / s) */
  vx: number;
  vy: number;
  size: number;
  spin: number;
  color: number;
  /** white rectangular candy with the DAFNA logo */
  logo: boolean;
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

/** Candies raining over the whole screen, from just above the top edge. */
export function makePieces(): Piece[] {
  const r = rng(7);
  return Array.from({ length: COUNT }, (_, i) => {
    const logo = i % LOGO_EVERY === 0;
    return {
      x: (i + r()) / COUNT, // evenly spread across the width
      y: -0.05 - r() * 0.5, // staggered above the top edge: a continuous shower
      vx: (r() - 0.5) * 0.08,
      vy: 0.25 + r() * 0.2,
      size: logo ? 0.014 + r() * 0.004 : 0.007 + r() * 0.005,
      // fast tumble: at least ~1 turn per second, either direction
      spin: (r() < 0.5 ? -1 : 1) * (logo ? 6 + r() * 4 : 10 + r() * 14),
      color: Math.floor(r() * 4),
      logo,
    };
  });
}

/** Position of a piece `s` seconds after the burst (fractions of width / height). */
export function piecePosition(p: Piece, s: number): { x: number; y: number } {
  return { x: p.x + p.vx * s, y: p.y + p.vy * s + 0.12 * s * s };
}

/** Rounded rectangle path centred on the origin. */
function candyRect(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(-w / 2, -h / 2, w, h, radius);
  else ctx.rect(-w / 2, -h / 2, w, h);
}

/**
 * "Candy" celebration (D-4.1): a 2.6 s shower of rectangular sweets in Dafna colours
 * (brand blue, white, light blue, graphite — tokens --particle-1..4), mixed with white candies
 * carrying the DAFNA logo, over the whole screen during the 360° turn.
 * No own animation loop: the reveal driver calls draw(ms) from the existing render loop.
 */
export const Confetti = forwardRef<ConfettiHandle>(function Confetti(_props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pieces = useRef<Piece[]>(makePieces());
  const colors = useRef<string[]>([]);
  const logo = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    colors.current = [
      cssToken('--particle-1', '#009fe3'),
      cssToken('--particle-2', '#ffffff'),
      cssToken('--particle-3', '#99e0ff'),
      cssToken('--particle-4', '#2a2928'),
    ];
    // the dark-text logo reads on the white logo candy in both themes
    const img = new Image();
    img.src = LOGO_URL.light;
    logo.current = img;
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
      ctx.globalAlpha = Math.min(1, (CONFETTI_MS - ms) / 500);
      const img = logo.current;
      for (const p of pieces.current) {
        const pos = piecePosition(p, s);
        const size = p.size * Math.max(w, h);
        ctx.save();
        ctx.translate(pos.x * w, pos.y * h);
        ctx.rotate(p.spin * s);
        if (p.logo) {
          // white wrapper with the DAFNA logo
          const cw = size * 1.6;
          const ch = cw / 1.9;
          ctx.fillStyle = '#ffffff';
          candyRect(ctx, cw, ch, ch * 0.22);
          ctx.fill();
          if (img?.complete && img.naturalWidth > 0) {
            const lw = cw * 0.8;
            const lh = lw / LOGO_ASPECT;
            ctx.drawImage(img, -lw / 2, -lh / 2, lw, lh);
          }
        } else {
          // rectangular sweet with a soft highlight stripe
          const cw = size * 1.3;
          const ch = size * 0.8;
          ctx.fillStyle = colors.current[p.color] ?? '#009fe3';
          candyRect(ctx, cw, ch, ch * 0.25);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.fillRect(-cw / 2 + ch * 0.2, -ch * 0.28, cw - ch * 0.4, ch * 0.14);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  }));

  return <canvas ref={canvas} className="confetti" aria-hidden="true" />;
});
