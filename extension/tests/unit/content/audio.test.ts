import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { ContentAudioController } from "../../../src/content/audio";
import { createMockChrome, setChromeInstance } from "../../../src/shared/chrome";

let chromeMock: ReturnType<typeof createMockChrome>;

class FakeGainNode {
  public gain = {
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeOscillatorNode {
  public type = "sine";
  public frequency = { value: 0 };
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  addEventListener = vi.fn((_: string, cb?: () => void) => cb && cb());
}

class FakeAudioContext {
  public state: AudioContextState = "running";
  public currentTime = 0;
  public destination = {};
  createGain = vi.fn(() => new FakeGainNode());
  createOscillator = vi.fn(() => new FakeOscillatorNode());
  createBufferSource = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    addEventListener: vi.fn((_: string, cb?: () => void) => cb && cb()),
  }));
  resume = vi.fn(() => Promise.resolve());
  decodeAudioData = vi.fn(() => Promise.reject(new Error("decode disabled")));
}

describe("ContentAudioController", () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    chromeMock = createMockChrome();
    chromeMock.runtime.getURL = (path: string) => path;
    setChromeInstance(chromeMock);
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    setChromeInstance(undefined);
    globalThis.AudioContext = originalAudioContext;
    globalThis.fetch = originalFetch;
  });

  test("queues playback until unlocked", async () => {
    const controller = new ContentAudioController({
      window,
      logger: console,
    } as any);

    await controller.handleChimeRequest();

    await (controller as any).unlock?.();
    await controller.handleChimeRequest();

    const contextInstance = (controller as any).audioContext as FakeAudioContext;
    expect(contextInstance.createOscillator).toHaveBeenCalled();
  });

  test("resumes suspended context before playback", async () => {
    const controller = new ContentAudioController({
      window,
      logger: console,
    } as any);

    await (controller as any).unlock?.();

    const contextInstance = (controller as any).audioContext as FakeAudioContext;
    contextInstance.state = "suspended";

    await controller.handleChimeRequest();

    expect(contextInstance.resume).toHaveBeenCalled();
  });
});
