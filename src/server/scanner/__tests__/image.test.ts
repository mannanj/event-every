import { describe, expect, test } from 'bun:test';
import { MAX_SCANNER_IMAGE_BYTES, validateScannerImageDataUrl } from '../image';

const dataUrl = (mime: string, bytes: Uint8Array | readonly number[]) =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

describe('validateScannerImageDataUrl', () => {
  test.each([
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0]],
    ['image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ] as const)('admits a valid %s signature', (mime, bytes) => {
    expect(validateScannerImageDataUrl(dataUrl(mime, bytes))).toEqual({
      mimeType: mime,
      byteLength: bytes.length,
    });
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

  test('rejects decoded bytes over the eight MiB admission limit', () => {
    const bytes = new Uint8Array(MAX_SCANNER_IMAGE_BYTES + 1);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => validateScannerImageDataUrl(dataUrl('image/png', bytes))).toThrow('Image payload is too large');
  });
});
