export const MAX_SCANNER_IMAGE_BYTES = 8 * 1024 * 1024;

type ScannerImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

const DATA_URL_HEADER = /^data:(image\/(?:png|jpeg|webp));base64,/;

function isStrictBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  const paddingIndex = value.indexOf('=');
  const content = paddingIndex === -1 ? value : value.slice(0, paddingIndex);
  const padding = paddingIndex === -1 ? '' : value.slice(paddingIndex);
  return /^[A-Za-z0-9+/]+$/.test(content)
    && (padding === '' || padding === '=' || padding === '==');
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasWebpSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

export function validateScannerImageDataUrl(
  dataUrl: string,
): Readonly<{ mimeType: ScannerImageMimeType; byteLength: number }> {
  const match = DATA_URL_HEADER.exec(dataUrl);
  if (!match) throw new Error('Invalid image data URL');

  const mimeType = match[1] as ScannerImageMimeType;
  const encoded = dataUrl.slice(match[0].length);
  if (encoded.length === 0) throw new Error('Image payload is empty');
  if (!isStrictBase64(encoded)) throw new Error('Invalid image data URL');

  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.byteLength === 0) throw new Error('Image payload is empty');
  if (bytes.byteLength > MAX_SCANNER_IMAGE_BYTES) throw new Error('Image payload is too large');

  const signatureMatches = (mimeType === 'image/png' && hasPngSignature(bytes))
    || (mimeType === 'image/jpeg' && hasJpegSignature(bytes))
    || (mimeType === 'image/webp' && hasWebpSignature(bytes));
  if (!signatureMatches) throw new Error('Unsupported image content');

  return { mimeType, byteLength: bytes.byteLength };
}
