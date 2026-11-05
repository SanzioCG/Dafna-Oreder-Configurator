import { useThree } from '@react-three/fiber';
import { useEffect, type MutableRefObject } from 'react';
import type { Camera, Scene, WebGLRenderer } from 'three';
import { cssToken } from '../theme/cssToken';

export type CaptureFn = () => string | null;

/** API render limit is 2 MB decoded: base64 of that is ~2.67 M characters; keep a margin. */
export const MAX_RENDER_DATA_URL_CHARS = 2_600_000;
const WIDTHS = [1280, 960, 640];

/**
 * Bounding box (source pixels) of everything drawn on the transparent WebGL canvas — wardrobe,
 * platform, shadow — with a margin, so the render shows the wardrobe large instead of a small
 * object in an empty 16:9 frame. Scans a 320 px wide copy (fast). Null if nothing is drawn.
 */
export function contentBox(src: HTMLCanvasElement, margin = 0.08) {
  const sw = Math.min(320, src.width);
  const sh = Math.max(1, Math.round((src.height * sw) / src.width));
  const probe = document.createElement('canvas');
  probe.width = sw;
  probe.height = sh;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  let x0 = sw;
  let y0 = sh;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if ((data[(y * sw + x) * 4 + 3] ?? 0) > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const k = src.width / sw;
  const mx = (x1 - x0 + 1) * margin;
  const my = (y1 - y0 + 1) * margin;
  const left = Math.max(0, Math.floor((x0 - mx) * k));
  const top = Math.max(0, Math.floor((y0 - my) * k));
  const right = Math.min(src.width, Math.ceil((x1 + 1 + mx) * k));
  const bottom = Math.min(src.height, Math.ceil((y1 + 1 + my) * k));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * PNG data URL of the current 3D view cropped to the wardrobe, at most 1280 px on the long side
 * (smaller if the PNG would exceed the API limit), on the page background colour (the canvas
 * itself is transparent). Renders one frame synchronously first: the WebGL buffer is not
 * preserved between frames.
 */
export function captureView(gl: WebGLRenderer, scene: Scene, camera: Camera): string | null {
  gl.render(scene, camera);
  const src = gl.domElement;
  if (!src.width || !src.height) return null;
  const box = contentBox(src) ?? { x: 0, y: 0, w: src.width, h: src.height };
  const bg = cssToken('--bg', '#ffffff');
  for (const target of WIDTHS) {
    const scale = Math.min(1, target / Math.max(box.w, box.h));
    const w = Math.max(1, Math.round(box.w * scale));
    const h = Math.max(1, Math.round(box.h * scale));
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, w, h);
    const url = out.toDataURL('image/png');
    if (url.startsWith('data:image/png') && url.length <= MAX_RENDER_DATA_URL_CHARS) return url;
  }
  return null;
}

/** Inside <Canvas>: publishes captureView for the current renderer / scene / camera. */
export function RenderCapture({ target }: { target?: MutableRefObject<CaptureFn | null> }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (!target) return;
    target.current = () => {
      try {
        return captureView(gl, scene, camera);
      } catch {
        return null;
      }
    };
    return () => {
      target.current = null;
    };
  }, [gl, scene, camera, target]);
  return null;
}
