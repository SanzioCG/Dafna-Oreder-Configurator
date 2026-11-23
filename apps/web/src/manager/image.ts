/**
 * D-21: a decor photo is shrunk in the browser before upload (≤ 2048 px on the long side, JPEG):
 * a phone photo or a supplier scan of several MB becomes a few hundred KB, enough for the 3D
 * view and quick to load on the kiosk.
 */
export const TEXTURE_MAX_PX = 2048;

export async function shrinkImage(file: Blob, maxPx = TEXTURE_MAX_PX): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85),
  );
}
