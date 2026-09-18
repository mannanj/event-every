import { describe, expect, test } from 'bun:test';
import { scanDimensions, SCAN_IMAGE_MAX_EDGE } from '../imageDownscale';

describe('scanDimensions', () => {
  test('caps the long edge and keeps the aspect ratio', () => {
    expect(scanDimensions(2100, 1470)).toEqual({ width: 1024, height: 717, scaled: true });
    expect(scanDimensions(1470, 2100)).toEqual({ width: 717, height: 1024, scaled: true });
  });
  test('leaves small images alone', () => {
    expect(scanDimensions(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
    expect(scanDimensions(SCAN_IMAGE_MAX_EDGE, 400)).toEqual({ width: SCAN_IMAGE_MAX_EDGE, height: 400, scaled: false });
  });
  test('never produces a zero dimension', () => {
    expect(scanDimensions(5000, 1).height).toBe(1);
    expect(scanDimensions(0, 0).scaled).toBe(false);
  });
});
