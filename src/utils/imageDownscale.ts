/**
 * Images go to a vision model that bills by pixels, and the text on a flyer
 * or screenshot stays legible well below phone-camera resolution. Measured
 * on real scans: a 2100 px screenshot cost 2,577 prompt tokens, the same
 * image at 1024 px cost 1,381, with no change in what was read. So the long
 * edge is capped before upload. PNG stays PNG so screenshot text keeps its
 * hard edges; camera formats become JPEG.
 */

export const SCAN_IMAGE_MAX_EDGE = 1024;

export function scanDimensions(width: number, height: number, maxEdge = SCAN_IMAGE_MAX_EDGE): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= maxEdge || longest <= 0) return { width, height, scaled: false };
  const ratio = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), scaled: true };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image.'));
    reader.readAsDataURL(file);
  });
}

/**
 * The image as a data URL, downscaled to the scan ceiling when larger. Any
 * decode failure (HEIC in a browser that cannot draw it, a corrupt file)
 * falls back to the untouched bytes, exactly as before this existed.
 */
export async function imageToScanDataUrl(file: File, maxEdge = SCAN_IMAGE_MAX_EDGE): Promise<string> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return readAsDataUrl(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return readAsDataUrl(file);
  }
  try {
    const target = scanDimensions(bitmap.width, bitmap.height, maxEdge);
    if (!target.scaled) return readAsDataUrl(file);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) return readAsDataUrl(file);
    context.drawImage(bitmap, 0, 0, target.width, target.height);
    const keepPng = file.type === 'image/png';
    return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', keepPng ? undefined : 0.9);
  } catch {
    return readAsDataUrl(file);
  } finally {
    bitmap.close();
  }
}
