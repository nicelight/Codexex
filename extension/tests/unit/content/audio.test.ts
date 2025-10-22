import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import type { SpyInstance } from "vitest";
import { ContentAudioController } from "../../../src/content/audio";
import { createMockChrome, setChromeInstance } from "../../../src/shared/chrome";

let chromeMock: ReturnType<typeof createMockChrome>;
let playSpy: SpyInstance;
let pauseSpy: SpyInstance;

const AUDIO_ELEMENT_ID = "codex-tasks-audio";

describe("ContentAudioController", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    chromeMock = createMockChrome();
    chromeMock.runtime.getURL = (path: string) => path;
    setChromeInstance(chromeMock);
    playSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, "play")
      .mockImplementation(() => Promise.resolve());
    pauseSpy = vi
      .spyOn(window.HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    setChromeInstance(undefined);
    vi.restoreAllMocks();
  });

  test("creates hidden audio element markup", () => {
    new ContentAudioController({
      window,
      logger: console,
    } as any);

    const element = document.getElementById(AUDIO_ELEMENT_ID) as HTMLAudioElement | null;

    expect(element).toBeTruthy();
    expect(element?.dataset.codexAudio).toBe("chime");
    expect(element?.getAttribute("aria-hidden")).toBe("true");
    expect(element?.muted).toBe(false);
    expect(element?.volume).toBeGreaterThan(0);
  });

  test("queues playback until unlocked", async () => {
    const controller = new ContentAudioController({
      window,
      logger: console,
    } as any);

    await controller.handleChimeRequest();

    expect((controller as any).pending).toBe(true);
    expect(playSpy).not.toHaveBeenCalled();

    await (controller as any).unlock();

    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(pauseSpy).toHaveBeenCalledTimes(2);
    expect((controller as any).pending).toBe(false);
  });

  test("applies sound settings to the audio element", async () => {
    const controller = new ContentAudioController({
      window,
      logger: console,
    } as any);

    const element = document.getElementById(AUDIO_ELEMENT_ID) as HTMLAudioElement | null;
    expect(element).not.toBeNull();

    controller.applySettings({ sound: false });
    expect(element?.muted).toBe(true);

    controller.applySettings({ sound: true, soundVolume: 0.5 });
    expect(element?.muted).toBe(false);
    expect(element?.volume).toBeCloseTo(0.5);
  });

  test("requeues playback when play rejects", async () => {
    const controller = new ContentAudioController({
      window,
      logger: console,
    } as any);

    await (controller as any).unlock();
    playSpy.mockClear();
    pauseSpy.mockClear();

    playSpy.mockRejectedValueOnce(new Error("blocked"));

    await controller.handleChimeRequest();

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect((controller as any).pending).toBe(true);
    expect(playSpy).toHaveBeenLastCalledWith();
  });
});
