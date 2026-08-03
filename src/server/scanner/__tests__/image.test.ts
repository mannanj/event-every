import { describe, expect, test } from 'bun:test';
import { MAX_SCANNER_IMAGE_BYTES, validateScannerImageDataUrl } from '../image';

const dataUrl = (mime: string, bytes: Uint8Array | readonly number[]) =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

function writeUint32BigEndian(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, false);
}

function writeUint32LittleEndian(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writePngChunk(bytes: Uint8Array, offset: number, type: string, length: number): number {
  writeUint32BigEndian(bytes, offset, length);
  for (let index = 0; index < 4; index++) bytes[offset + 4 + index] = type.charCodeAt(index);
  const crcOffset = offset + 8 + length;
  writeUint32BigEndian(bytes, crcOffset, crc32(bytes.subarray(offset + 4, crcOffset)));
  return crcOffset + 4;
}

function syntheticPng(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let offset = writePngChunk(bytes, 8, 'IHDR', 13);
  bytes[offset - 17] = 0;
  bytes[offset - 16] = 0;
  bytes[offset - 15] = 0;
  bytes[offset - 14] = 1;
  bytes[offset - 13] = 0;
  bytes[offset - 12] = 0;
  bytes[offset - 11] = 0;
  bytes[offset - 10] = 1;
  // Recompute IHDR's CRC after setting the one-by-one dimensions.
  writeUint32BigEndian(bytes, offset - 4, crc32(bytes.subarray(12, offset - 4)));
  offset = writePngChunk(bytes, offset, 'IDAT', byteLength - 57);
  writePngChunk(bytes, offset, 'IEND', 0);
  return bytes;
}

function syntheticJpeg(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0xff, 0xd8]);
  let offset = 2;
  let remaining = byteLength - 4;
  while (remaining > 0) {
    let segmentBytes = Math.min(65_537, remaining);
    if (remaining - segmentBytes > 0 && remaining - segmentBytes < 4) {
      segmentBytes -= 4 - (remaining - segmentBytes);
    }
    bytes[offset] = 0xff;
    bytes[offset + 1] = 0xe1;
    bytes[offset + 2] = ((segmentBytes - 2) >>> 8) & 0xff;
    bytes[offset + 3] = (segmentBytes - 2) & 0xff;
    offset += segmentBytes;
    remaining -= segmentBytes;
  }
  bytes.set([0xff, 0xd9], offset);
  return bytes;
}

function webp(primaryType: 'VP8 ' | 'VP8L' | 'VP8X', payload: readonly number[]): Uint8Array {
  const paddedLength = payload.length + (payload.length & 1);
  const bytes = new Uint8Array(12 + 8 + paddedLength);
  bytes.set([0x52, 0x49, 0x46, 0x46]);
  writeUint32LittleEndian(bytes, 4, bytes.length - 8);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  for (let index = 0; index < 4; index++) bytes[12 + index] = primaryType.charCodeAt(index);
  writeUint32LittleEndian(bytes, 16, payload.length);
  bytes.set(payload, 20);
  return bytes;
}

function syntheticWebp(byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0x52, 0x49, 0x46, 0x46]);
  writeUint32LittleEndian(bytes, 4, byteLength - 8);
  bytes.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c], 8);
  writeUint32LittleEndian(bytes, 16, byteLength - 20);
  bytes[20] = 0x2f;
  return bytes;
}

function extendedWebp(imageType: 'VP8 ' | 'VP8L', imagePayload: readonly number[]): Uint8Array {
  const header = webp('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const image = webp(imageType, imagePayload).subarray(12);
  const bytes = new Uint8Array(header.length + image.length);
  bytes.set(header);
  bytes.set(image, header.length);
  writeUint32LittleEndian(bytes, 4, bytes.length - 8);
  return bytes;
}

describe('validateScannerImageDataUrl', () => {
  test.each([
    ['image/png', syntheticPng(MAX_SCANNER_IMAGE_BYTES)],
    ['image/jpeg', syntheticJpeg(MAX_SCANNER_IMAGE_BYTES)],
    ['image/webp', syntheticWebp(MAX_SCANNER_IMAGE_BYTES)],
  ] as const)('decoded image byte ceiling is enforced: accepts %s at eight MiB', (mime, bytes) => {
    expect(validateScannerImageDataUrl(dataUrl(mime, bytes))).toEqual({
      mimeType: mime,
      byteLength: MAX_SCANNER_IMAGE_BYTES,
    });
  });

  test.each([
    ['image/png', syntheticPng(MAX_SCANNER_IMAGE_BYTES + 1)],
    ['image/jpeg', syntheticJpeg(MAX_SCANNER_IMAGE_BYTES + 1)],
    ['image/webp', Uint8Array.from([...syntheticWebp(MAX_SCANNER_IMAGE_BYTES), 0])],
  ] as const)('rejects a structurally formed %s at decoded eight MiB plus one', (mime, bytes) => {
    expect(() => validateScannerImageDataUrl(dataUrl(mime, bytes))).toThrow('Image payload is too large');
  });

  test.each([
    ['VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 1, 0, 1, 0]],
    ['VP8L', [0x2f, 0, 0, 0, 0]],
  ] as const)('accepts a bounded WebP %s image chunk', (type, payload) => {
    const bytes = webp(type, payload);
    expect(validateScannerImageDataUrl(dataUrl('image/webp', bytes))).toEqual({
      mimeType: 'image/webp',
      byteLength: bytes.length,
    });
  });

  test.each([
    ['VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 1, 0, 1, 0]],
    ['VP8L', [0x2f, 0, 0, 0, 0]],
  ] as const)('accepts an extended WebP VP8X header followed by %s image data', (type, payload) => {
    const bytes = extendedWebp(type, payload);
    expect(validateScannerImageDataUrl(dataUrl('image/webp', bytes))).toEqual({
      mimeType: 'image/webp',
      byteLength: bytes.length,
    });
  });

  test('rejects an extended WebP without image data and duplicate image chunks', () => {
    const headerOnly = webp('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const duplicate = extendedWebp('VP8L', [0x2f, 0, 0, 0, 0]);
    const secondImage = webp('VP8L', [0x2f, 0, 0, 0, 0]).subarray(12);
    const duplicateContainer = new Uint8Array(duplicate.length + secondImage.length);
    duplicateContainer.set(duplicate);
    duplicateContainer.set(secondImage, duplicate.length);
    writeUint32LittleEndian(duplicateContainer, 4, duplicateContainer.length - 8);

    expect(() => validateScannerImageDataUrl(dataUrl('image/webp', headerOnly)))
      .toThrow('Unsupported image content');
    expect(() => validateScannerImageDataUrl(dataUrl('image/webp', duplicateContainer)))
      .toThrow('Unsupported image content');
  });

  test.each([
    ['PNG header only', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['PNG truncated chunk', 'image/png', [...syntheticPng(57).slice(0, -1)]],
    ['PNG trailing bytes', 'image/png', [...syntheticPng(57), 0]],
    ['JPEG header only', 'image/jpeg', [0xff, 0xd8]],
    ['JPEG truncated marker', 'image/jpeg', [0xff, 0xd8, 0xff, 0xe1, 0, 8, 0]],
    ['JPEG trailing bytes', 'image/jpeg', [...syntheticJpeg(8), 0]],
    ['WebP header only', 'image/webp', [0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
    ['WebP truncated chunk', 'image/webp', [...webp('VP8L', [0x2f, 0, 0, 0, 0]).slice(0, -1)]],
    ['WebP trailing bytes', 'image/webp', [...webp('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 0]],
  ] as const)('truncated image structure is rejected: %s', (_name, mime, bytes) => {
    expect(() => validateScannerImageDataUrl(dataUrl(mime, bytes))).toThrow('Unsupported image content');
  });

  test.each([
    ['image/png', [0xff, 0xd8, 0xff]],
    ['image/jpeg', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['image/webp', [0xff, 0xd8, 0xff]],
  ] as const)('rejects a %s declaration with spoofed magic bytes', (mime, bytes) => {
    expect(() => validateScannerImageDataUrl(dataUrl(mime, bytes))).toThrow('Unsupported image content');
  });

  test('rejects malformed base64 and an empty payload', () => {
    expect(() => validateScannerImageDataUrl('data:image/png;base64,%%%%')).toThrow('Invalid image data URL');
    expect(() => validateScannerImageDataUrl('data:image/png;base64,')).toThrow('Image payload is empty');
  });
});
