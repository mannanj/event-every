// WebGPU exposes no memory counters, and onnxruntime-web keeps its buffer pool
// private, so "the model was disposed" is otherwise an unverifiable claim. This
// wraps the device handed to onnxruntime and counts what it allocates and frees,
// which turns cleanup into something a run can check rather than assert.
//
// Honest limit, and it cuts one way only: WebGPU also reclaims a buffer when the
// object is garbage collected, without `destroy()` ever being called. So a
// residual `liveBytes` is NOT proof of a leak. What it does prove is the
// opposite: a count that returns to zero means every buffer was released
// explicitly, and a count that climbs across identical scans is a real leak.

export interface GpuSnapshot {
  readonly instrumented: boolean;
  readonly devicesRequested: number;
  readonly devicesDestroyed: number;
  readonly deviceLost: string | null;
  readonly buffersCreated: number;
  readonly buffersDestroyed: number;
  readonly liveBuffers: number;
  readonly liveBytes: number;
  readonly peakLiveBytes: number;
  readonly totalBytesAllocated: number;
  readonly texturesCreated: number;
  readonly texturesDestroyed: number;
}

interface ProbeBuffer {
  destroy?: () => void;
}

interface ProbeTexture {
  destroy?: () => void;
}

interface ProbeDevice {
  createBuffer(descriptor: { size?: number }): ProbeBuffer;
  createTexture?(descriptor: unknown): ProbeTexture;
  destroy?: () => void;
  lost?: Promise<{ reason?: string; message?: string }>;
}

interface ProbeAdapter {
  requestDevice(...args: unknown[]): Promise<ProbeDevice>;
}

export interface ProbeGpu {
  requestAdapter(...args: unknown[]): Promise<ProbeAdapter | null>;
}

interface BufferRecord {
  readonly size: number;
  readonly deviceId: number;
  destroyed: boolean;
}

export interface GpuTracker {
  readonly wrapGpu: (gpu: ProbeGpu) => ProbeGpu;
  readonly snapshot: () => GpuSnapshot;
  readonly mark: () => void;
}

export function createGpuTracker(): GpuTracker {
  // Buffers are held weakly. A strong map would keep every buffer reachable and
  // so prevent the very reclamation this is measuring.
  const records = new WeakMap<object, BufferRecord>();
  const liveByDevice = new Map<number, { buffers: number; bytes: number }>();

  let devicesRequested = 0;
  let devicesDestroyed = 0;
  let deviceLost: string | null = null;
  let buffersCreated = 0;
  let buffersDestroyed = 0;
  let liveBuffers = 0;
  let liveBytes = 0;
  let peakLiveBytes = 0;
  let totalBytesAllocated = 0;
  let texturesCreated = 0;
  let texturesDestroyed = 0;

  function releaseBuffer(buffer: object): void {
    const record = records.get(buffer);
    if (!record || record.destroyed) return;
    record.destroyed = true;
    buffersDestroyed += 1;
    liveBuffers -= 1;
    liveBytes -= record.size;
    const device = liveByDevice.get(record.deviceId);
    if (device) {
      device.buffers -= 1;
      device.bytes -= record.size;
    }
  }

  function wrapDevice(device: ProbeDevice, deviceId: number): ProbeDevice {
    liveByDevice.set(deviceId, { buffers: 0, bytes: 0 });

    // A lost device is how an out-of-memory failure actually surfaces on Safari;
    // without this it reads as an unexplained hang.
    void device.lost
      ?.then((info) => {
        deviceLost = info?.message || info?.reason || 'device lost';
      })
      .catch(() => undefined);

    const createBuffer = device.createBuffer.bind(device);
    device.createBuffer = (descriptor: { size?: number }) => {
      const buffer = createBuffer(descriptor);
      const size = Number(descriptor?.size ?? 0);
      records.set(buffer as object, { size, deviceId, destroyed: false });
      buffersCreated += 1;
      liveBuffers += 1;
      liveBytes += size;
      totalBytesAllocated += size;
      if (liveBytes > peakLiveBytes) peakLiveBytes = liveBytes;
      const tally = liveByDevice.get(deviceId);
      if (tally) {
        tally.buffers += 1;
        tally.bytes += size;
      }
      const destroy = buffer.destroy?.bind(buffer);
      if (destroy) {
        buffer.destroy = () => {
          releaseBuffer(buffer as object);
          destroy();
        };
      }
      return buffer;
    };

    const createTexture = device.createTexture?.bind(device);
    if (createTexture) {
      device.createTexture = (descriptor: unknown) => {
        const texture = createTexture(descriptor);
        texturesCreated += 1;
        const destroy = texture.destroy?.bind(texture);
        if (destroy) {
          let destroyed = false;
          texture.destroy = () => {
            if (!destroyed) {
              destroyed = true;
              texturesDestroyed += 1;
            }
            destroy();
          };
        }
        return texture;
      };
    }

    const destroyDevice = device.destroy?.bind(device);
    if (destroyDevice) {
      device.destroy = () => {
        // Destroying a device invalidates everything it owns, so its whole
        // tally clears at once rather than buffer by buffer.
        const tally = liveByDevice.get(deviceId);
        if (tally) {
          liveBuffers -= tally.buffers;
          liveBytes -= tally.bytes;
          buffersDestroyed += tally.buffers;
          liveByDevice.delete(deviceId);
        }
        devicesDestroyed += 1;
        destroyDevice();
      };
    }

    return device;
  }

  return {
    wrapGpu(gpu: ProbeGpu): ProbeGpu {
      const requestAdapter = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async (...args: unknown[]) => {
        const adapter = await requestAdapter(...args);
        if (!adapter) return adapter;
        const requestDevice = adapter.requestDevice.bind(adapter);
        adapter.requestDevice = async (...deviceArgs: unknown[]) => {
          devicesRequested += 1;
          return wrapDevice(await requestDevice(...deviceArgs), devicesRequested);
        };
        return adapter;
      };
      return gpu;
    },
    mark(): void {
      peakLiveBytes = liveBytes;
    },
    snapshot(): GpuSnapshot {
      return {
        instrumented: true,
        devicesRequested,
        devicesDestroyed,
        deviceLost,
        buffersCreated,
        buffersDestroyed,
        liveBuffers,
        liveBytes,
        peakLiveBytes,
        totalBytesAllocated,
        texturesCreated,
        texturesDestroyed,
      };
    },
  };
}

export const EMPTY_GPU_SNAPSHOT: GpuSnapshot = {
  instrumented: false,
  devicesRequested: 0,
  devicesDestroyed: 0,
  deviceLost: null,
  buffersCreated: 0,
  buffersDestroyed: 0,
  liveBuffers: 0,
  liveBytes: 0,
  peakLiveBytes: 0,
  totalBytesAllocated: 0,
  texturesCreated: 0,
  texturesDestroyed: 0,
};

let installed: GpuTracker | null = null;

// Installed once, before onnxruntime requests its adapter. Repeated calls return
// the same tracker so counters survive a model reload.
export function installGpuProbe(scope: { gpu?: ProbeGpu } = navigator as { gpu?: ProbeGpu }): GpuTracker | null {
  if (installed) return installed;
  if (!scope?.gpu) return null;
  installed = createGpuTracker();
  installed.wrapGpu(scope.gpu);
  return installed;
}

export function gpuSnapshot(): GpuSnapshot {
  return installed ? installed.snapshot() : EMPTY_GPU_SNAPSHOT;
}

export function formatBytes(bytes: number): string {
  if (Math.abs(bytes) >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)}GB`;
  if (Math.abs(bytes) >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`;
  if (Math.abs(bytes) >= 1_000) return `${(bytes / 1_000).toFixed(1)}KB`;
  return `${bytes}B`;
}
