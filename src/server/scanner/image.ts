export const MAX_SCANNER_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = MAX_SCANNER_IMAGE_BYTES;

type ScannerImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

const DATA_URL_HEADER = /^data:(image\/(?:png|jpeg|webp));base64,/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function isStrictBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) return false;
  const paddingIndex = value.indexOf('=');
  const content = paddingIndex === -1 ? value : value.slice(0, paddingIndex);
  const padding = paddingIndex === -1 ? '' : value.slice(paddingIndex);
  return /^[A-Za-z0-9+/]+$/.test(content)
    && (padding === '' || padding === '=' || padding === '==');
}

function matchesAt(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

function hasValidPngStructure(bytes: Uint8Array): boolean {
  if (bytes.length < 57 || !matchesAt(bytes, 0, PNG_SIGNATURE)) return false;

  let offset: number = PNG_SIGNATURE.length;
  let chunkIndex = 0;
  let sawImageData = false;

  while (offset < bytes.length) {
    if (bytes.length - offset < 12) return false;
    const dataLength = readUint32BigEndian(bytes, offset);
    if (dataLength > bytes.length - offset - 12) return false;

    const type = chunkType(bytes, offset + 4);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + dataLength + 4;

    if (chunkIndex === 0) {
      if (type !== 'IHDR' || dataLength !== 13) return false;
      const width = readUint32BigEndian(bytes, dataOffset);
      const height = readUint32BigEndian(bytes, dataOffset + 4);
      if (width === 0 || height === 0) return false;
    } else if (type === 'IHDR') {
      return false;
    }

    if (type === 'IDAT') sawImageData = true;
    if (type === 'IEND') {
      return dataLength === 0 && sawImageData && nextOffset === bytes.length;
    }

    offset = nextOffset;
    chunkIndex++;
  }

  return false;
}

function markerHasNoLength(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function findMarkerAfterScan(bytes: Uint8Array, offset: number): number | undefined {
  let cursor = offset;
  while (cursor < bytes.length) {
    if (bytes[cursor] !== 0xff) {
      cursor++;
      continue;
    }
    if (cursor + 1 >= bytes.length) return undefined;
    const marker = bytes[cursor + 1]!;
    if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) {
      cursor += marker === 0xff ? 1 : 2;
      continue;
    }
    return cursor;
  }
  return undefined;
}

function hasValidJpegStructure(bytes: Uint8Array): boolean {
  if (bytes.length < 8 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;

  let offset = 2;
  let sawSegment = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return false;

    const marker = bytes[offset++]!;
    if (marker === 0x00 || marker === 0xd8) return false;
    if (marker === 0xd9) return sawSegment && offset === bytes.length;
    if (markerHasNoLength(marker)) {
      sawSegment = true;
      continue;
    }

    if (bytes.length - offset < 2) return false;
    const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (segmentLength < 2 || segmentLength > bytes.length - offset) return false;
    offset += segmentLength;
    sawSegment = true;

    if (marker === 0xda) {
      const nextMarker = findMarkerAfterScan(bytes, offset);
      if (nextMarker === undefined) return false;
      offset = nextMarker;
    }
  }

  return false;
}

function hasValidWebpImageChunk(bytes: Uint8Array, type: string, offset: number, length: number): boolean {
  if (type === 'VP8 ') {
    return length >= 10
      && bytes[offset + 3] === 0x9d
      && bytes[offset + 4] === 0x01
      && bytes[offset + 5] === 0x2a;
  }
  if (type === 'VP8L') return length >= 5 && bytes[offset] === 0x2f;
  return false;
}

function hasValidWebpExtendedHeader(bytes: Uint8Array, offset: number, length: number): boolean {
  return length === 10
    && (bytes[offset]! & 0xc1) === 0
    && bytes[offset + 1] === 0
    && bytes[offset + 2] === 0
    && bytes[offset + 3] === 0;
}

function hasValidWebpStructure(bytes: Uint8Array): boolean {
  if (bytes.length < 20
    || chunkType(bytes, 0) !== 'RIFF'
    || chunkType(bytes, 8) !== 'WEBP'
    || readUint32LittleEndian(bytes, 4) !== bytes.length - 8) {
    return false;
  }

  let offset = 12;
  let extended = false;
  let sawImage = false;
  while (offset < bytes.length) {
    if (bytes.length - offset < 8) return false;
    const type = chunkType(bytes, offset);
    const dataLength = readUint32LittleEndian(bytes, offset + 4);
    const dataOffset = offset + 8;
    if (dataLength > bytes.length - dataOffset) return false;
    const dataEnd = dataOffset + dataLength;
    const nextOffset = dataEnd + (dataLength & 1);
    if (nextOffset > bytes.length || (dataLength & 1) === 1 && bytes[dataEnd] !== 0) return false;

    const isImage = type === 'VP8 ' || type === 'VP8L';
    if (offset === 12) {
      if (type === 'VP8X') {
        if (!hasValidWebpExtendedHeader(bytes, dataOffset, dataLength)) return false;
        extended = true;
      } else if (isImage) {
        if (!hasValidWebpImageChunk(bytes, type, dataOffset, dataLength)) return false;
        sawImage = true;
      } else {
        return false;
      }
    } else if (type === 'VP8X') {
      return false;
    } else if (isImage) {
      if (!extended || sawImage || !hasValidWebpImageChunk(bytes, type, dataOffset, dataLength)) return false;
      sawImage = true;
    }
    offset = nextOffset;
  }

  return sawImage && offset === bytes.length;
}

function validateStructuredImage(bytes: Uint8Array, mediaType: ScannerImageMimeType): boolean {
  if (mediaType === 'image/png') return hasValidPngStructure(bytes);
  if (mediaType === 'image/jpeg') return hasValidJpegStructure(bytes);
  return hasValidWebpStructure(bytes);
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

  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.byteLength === 0) throw new Error('Image payload is empty');
  if (decoded.byteLength > MAX_IMAGE_BYTES) throw new Error('Image payload is too large');
  if (!validateStructuredImage(decoded, mimeType)) throw new Error('Unsupported image content');

  return { mimeType, byteLength: decoded.byteLength };
}
