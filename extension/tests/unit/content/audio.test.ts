import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { ContentAudioController } from "../../../src/content/audio";
import { createMockChrome, setChromeInstance } from "../../../src/shared/chrome";

let chromeMock: ReturnType<typeof createMockChrome>;
let createdAudio!: HTMLAudioElement & {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
};

const originalCreateElement = document.createElement.bind(document);

describe("ContentAudioController", () => {
  beforeEach(() => {
    chromeMock = createMockChrome();
    chromeMock.runtime.getURL = (path: string) => path;
    setChromeInstance(chromeMock);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName.toLowerCase() === "audio") {
        const element = originalCreateElement(tagName) as HTMLAudioElement;
        element.play = vi.fn(async () => {}) as unknown as HTMLAudioElement["play"];
        element.pause = vi.fn() as unknown as HTMLAudioElement["pause"];
        element.load = vi.fn() as unknown as HTMLAudioElement["load"];
        element.addEventListener = vi.fn();
        createdAudio = element as typeof createdAudio;
        return element;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement);
  });

  afterEach(() => {
    setChromeInstance(undefined);
    if (createdAudio && createdAudio.parentNode) {
      createdAudio.parentNode.removeChild(createdAudio);
    }
    vi.restoreAllMocks();
  });

  test("plays pending chime after unlock", async () => {
    const controller = new ContentAudioController({
      window,
      logger: console,
    } as any);

    await controller.handleChimeRequest();

    await (controller as any).unlock?.();

    expect(createdAudio.play).toHaveBeenCalledTimes(2);
    expect(createdAudio.pause).toHaveBeenCalledTimes(1);
    expect(createdAudio.volume).toBeCloseTo(0.2, 5);
    expect((controller as any).pending).toBe(false);
  });

  test("reattaches unlock listeners when priming playback is blocked", async () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const controller = new ContentAudioController({
      window,
      logger: console,
    } as any);

    await controller.handleChimeRequest();
    (controller as any).ensureAudioElement?.();

    (createdAudio.play as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      Promise.reject(new Error("blocked")),
    );

    addEventListenerSpy.mockClear();
    removeEventListenerSpy.mockClear();

    await (controller as any).unlock?.();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function), true);
    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function), true);
    expect(addEventListenerSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function), { capture: true });
    expect(addEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function), { capture: true });
    expect((controller as any).pending).toBe(true);
    expect((controller as any).unlocked).toBe(false);
  });

  test("updates audio element volume when settings change", async () => {
    const controller = new ContentAudioController({
      window,
      logger: console,
    } as any);

    await (controller as any).unlock?.();

    controller.applySettings({ soundVolume: 0.75 });

    expect(createdAudio.volume).toBeCloseTo(0.75, 5);
  });
});
