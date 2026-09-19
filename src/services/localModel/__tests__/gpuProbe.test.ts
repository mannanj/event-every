import { describe, expect, test } from 'bun:test';
import { createGpuTracker, formatBytes, type ProbeGpu } from '@/services/localModel/gpuProbe';

interface FakeBuffer {
  destroy: () => void;
  destroyed: boolean;
}

function fakeGpu(): { gpu: ProbeGpu; deviceDestroyed: () => number } {
  let destroyed = 0;
  const gpu = {
    async requestAdapter() {
      return {
        async requestDevice() {
          return {
            createBuffer(descriptor: { size?: number }) {
              const buffer: FakeBuffer = {
                destroyed: false,
                destroy() {
                  buffer.destroyed = true;
                },
              };
              void descriptor;
              return buffer;
            },
            createTexture() {
              return { destroy() {} };
            },
            destroy() {
              destroyed += 1;
            },
          };
        },
      };
    },
  } as unknown as ProbeGpu;
  return { gpu, deviceDestroyed: () => destroyed };
}

async function instrumentedDevice() {
  const tracker = createGpuTracker();
  const { gpu, deviceDestroyed } = fakeGpu();
  tracker.wrapGpu(gpu);
  const adapter = await gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  return { tracker, device, deviceDestroyed };
}

describe('gpu tracker', () => {
  test('counts allocation and release of a buffer', async () => {
    const { tracker, device } = await instrumentedDevice();

    const buffer = device.createBuffer({ size: 1024 });
    expect(tracker.snapshot()).toMatchObject({
      buffersCreated: 1,
      liveBuffers: 1,
      liveBytes: 1024,
      peakLiveBytes: 1024,
      totalBytesAllocated: 1024,
    });

    buffer.destroy!();
    expect(tracker.snapshot()).toMatchObject({
      buffersDestroyed: 1,
      liveBuffers: 0,
      liveBytes: 0,
      peakLiveBytes: 1024,
      totalBytesAllocated: 1024,
    });
  });

  test('passes the destroy through to the real buffer', async () => {
    const { device } = await instrumentedDevice();
    const buffer = device.createBuffer({ size: 8 }) as unknown as FakeBuffer;
    buffer.destroy();
    expect(buffer.destroyed).toBe(true);
  });

  test('a double destroy does not double count', async () => {
    const { tracker, device } = await instrumentedDevice();
    const buffer = device.createBuffer({ size: 64 });
    buffer.destroy!();
    buffer.destroy!();
    expect(tracker.snapshot()).toMatchObject({ buffersDestroyed: 1, liveBuffers: 0, liveBytes: 0 });
  });

  test('peak survives a release, which is what separates a peak from a leak', async () => {
    const { tracker, device } = await instrumentedDevice();
    const first = device.createBuffer({ size: 1_000 });
    const second = device.createBuffer({ size: 3_000 });
    first.destroy!();
    second.destroy!();
    const snapshot = tracker.snapshot();
    expect(snapshot.peakLiveBytes).toBe(4_000);
    expect(snapshot.liveBytes).toBe(0);
  });

  test('destroying the device clears everything it owned', async () => {
    const { tracker, device, deviceDestroyed } = await instrumentedDevice();
    device.createBuffer({ size: 2_000 });
    device.createBuffer({ size: 5_000 });
    expect(tracker.snapshot().liveBytes).toBe(7_000);

    device.destroy!();
    const snapshot = tracker.snapshot();
    expect(snapshot.liveBuffers).toBe(0);
    expect(snapshot.liveBytes).toBe(0);
    expect(snapshot.buffersDestroyed).toBe(2);
    expect(snapshot.devicesDestroyed).toBe(1);
    expect(deviceDestroyed()).toBe(1);
  });

  test('counts a second device separately', async () => {
    const tracker = createGpuTracker();
    const { gpu } = fakeGpu();
    tracker.wrapGpu(gpu);
    const adapter = await gpu.requestAdapter();
    const first = await adapter!.requestDevice();
    const second = await adapter!.requestDevice();

    first.createBuffer({ size: 100 });
    second.createBuffer({ size: 200 });
    first.destroy!();

    const snapshot = tracker.snapshot();
    expect(snapshot.devicesRequested).toBe(2);
    expect(snapshot.liveBytes).toBe(200);
  });

  test('counts textures', async () => {
    const { tracker, device } = await instrumentedDevice();
    const texture = device.createTexture!({});
    expect(tracker.snapshot().texturesCreated).toBe(1);
    texture.destroy!();
    expect(tracker.snapshot().texturesDestroyed).toBe(1);
  });

  test('a buffer with no size is counted but adds no bytes', async () => {
    const { tracker, device } = await instrumentedDevice();
    device.createBuffer({});
    expect(tracker.snapshot()).toMatchObject({ buffersCreated: 1, liveBytes: 0 });
  });

  test('formats bytes at each scale', () => {
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(2_048)).toBe('2.0KB');
    expect(formatBytes(1_500_000)).toBe('1.5MB');
    expect(formatBytes(1_371_900_000)).toBe('1.37GB');
  });
});
