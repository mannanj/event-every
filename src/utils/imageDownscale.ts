/**
 * The site's own photo path: the same pixel ceiling the embedded input uses
 * (see SCAN_IMAGE_MAX_EDGE in packages/event-every-input for the measurement),
 * returned as the data URL /api/scan takes.
 */
import { scanDimensions, SCAN_IMAGE_MAX_EDGE } from '@event-every/input/input-kinds';

export { scanDimensions, SCAN_IMAGE_MAX_EDGE };

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
