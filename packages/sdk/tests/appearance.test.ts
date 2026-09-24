import {
  type AppearanceModule,
  DEFAULT_THEME_PREFERENCE,
  HoustonSdk,
  InvalidThemeError,
  type KeyValueStore,
  type SdkPorts,
  THEME_KEYS,
  type ThemePreference,
} from "@houston/sdk";
import { describe, expect, it, vi } from "vitest";
import { memoryKv } from "../src/test-ports";

/**
 * The appearance module against a real device store.
 *
 * It reaches no network — the appearance is this device's own — so the `fetch`
 * port throws: a request from here would be a bug, and the suite would say so
 * instead of hanging on a stub. What is pinned is the vocabulary's edges (an
 * unknown value, a palette of the wrong mode), the diff-only write, and the
 * previous-versus-painted rule a debounced picker depends on.
 */

const REFUSE_FETCH = (() => {
  throw new Error("the appearance module must not reach the network");
}) as unknown as typeof fetch;

/** A preference with a non-default palette per mode, so a field's origin shows. */
const PICKED: ThemePreference = {
  mode: "dark",
  light: "catppuccin-latte",
  dark: "nord",
};

function makeSdk(
  seed: Record<string, string> = {},
  devicePreferences?: KeyValueStore,
) {
  const device = new Map<string, string>(Object.entries(seed));
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const ports: SdkPorts = {
    fetch: REFUSE_FETCH,
    storage: memoryKv(),
    devicePreferences: devicePreferences ?? memoryKv(device),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger,
  };
  const sdk = new HoustonSdk({
    baseUrl: "http://engine.test",
    ports,
    reactivity: false,
  });
  const appearance: AppearanceModule = sdk.appearance;
  return { appearance, sdk, device, logger };
}

describe("appearance.getTheme", () => {
  it("lands on the documented defaults when the device holds nothing", async () => {
    const { appearance, logger } = makeSdk();

    await expect(appearance.getTheme()).resolves.toEqual({
      pref: DEFAULT_THEME_PREFERENCE,
      unusable: [],
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("reads the three keys the app has always written", async () => {
    const { appearance } = makeSdk({
      [THEME_KEYS.mode]: "dark",
      [THEME_KEYS.light]: "catppuccin-latte",
      [THEME_KEYS.dark]: "nord",
    });

    await expect(appearance.getTheme()).resolves.toEqual({
      pref: PICKED,
      unusable: [],
    });
  });

  it("names a value it cannot use and falls back to that key's default", async () => {
    const { appearance, logger } = makeSdk({
      [THEME_KEYS.mode]: "sepia",
      [THEME_KEYS.light]: "nord",
    });

    const reading = await appearance.getTheme();

    expect(reading.pref).toEqual(DEFAULT_THEME_PREFERENCE);
    expect(reading.unusable).toEqual([
      { key: THEME_KEYS.mode, raw: "sepia" },
      // A dark palette under `theme.light` would paint dark colours in light
      // mode, so it is unusable rather than merely unexpected.
      { key: THEME_KEYS.light, raw: "nord" },
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  it("rejects when the store itself refuses: unknown is not unset", async () => {
    const { appearance } = makeSdk(
      {},
      {
        get: () => Promise.reject(new Error("storage read blocked")),
        set: async () => {},
        delete: async () => {},
      },
    );

    await expect(appearance.getTheme()).rejects.toThrow(/storage read blocked/);
  });
});

describe("appearance.setTheme", () => {
  it("writes ONLY the key that moved", async () => {
    const { appearance, device } = makeSdk({
      [THEME_KEYS.mode]: "dark",
      [THEME_KEYS.light]: "catppuccin-latte",
      [THEME_KEYS.dark]: "nord",
    });
    const written: string[] = [];
    const spy = vi.spyOn(device, "set");

    const next = await appearance.setTheme({ dark: "everforest" }, PICKED);
    for (const [key] of spy.mock.calls) written.push(key);

    expect(next).toEqual({ ...PICKED, dark: "everforest" });
    expect(written).toEqual([THEME_KEYS.dark]);
  });

  it("writes nothing at all when the pick is the one already saved", async () => {
    const { appearance, device } = makeSdk({
      [THEME_KEYS.mode]: "dark",
      [THEME_KEYS.light]: "catppuccin-latte",
      [THEME_KEYS.dark]: "nord",
    });
    const spy = vi.spyOn(device, "set");

    await appearance.setTheme({ dark: "nord" }, PICKED);

    expect(spy).not.toHaveBeenCalled();
  });

  it("diffs against the SAVED preference, not the one on screen", async () => {
    // The debounced picker's case: the palette is already PAINTED as everforest
    // and the store still holds nord, so the write has to happen.
    const { appearance, device } = makeSdk({
      [THEME_KEYS.mode]: "dark",
      [THEME_KEYS.light]: "catppuccin-latte",
      [THEME_KEYS.dark]: "nord",
    });

    await appearance.setTheme({ dark: "everforest" }, PICKED);

    expect(device.get(THEME_KEYS.dark)).toBe("everforest");
  });

  it("reads the saved preference when the caller passes none", async () => {
    const { appearance, device } = makeSdk({ [THEME_KEYS.dark]: "nord" });

    const next = await appearance.setTheme({ mode: "system" });

    expect(next).toEqual({
      mode: "system",
      light: DEFAULT_THEME_PREFERENCE.light,
      dark: "nord",
    });
    expect(device.get(THEME_KEYS.mode)).toBe("system");
    expect(device.get(THEME_KEYS.light)).toBeUndefined();
  });

  it("refuses a palette of the other mode, and stores nothing", async () => {
    const { appearance, device } = makeSdk();

    await expect(
      // `nord` is a dark palette: as the LIGHT pick it would paint dark colours
      // in light mode.
      appearance.setTheme({ light: "nord" }),
    ).rejects.toThrow(InvalidThemeError);
    expect(device.size).toBe(0);
  });

  it("refuses an unknown mode, and stores nothing", async () => {
    const { appearance, device } = makeSdk();

    await expect(
      appearance.setTheme({ mode: "sepia" as ThemePreference["mode"] }),
    ).rejects.toThrow(/"sepia" is not an appearance this build ships/);
    expect(device.size).toBe(0);
  });
});

/**
 * A write that moves two keys and fails on the second.
 *
 * The device holds one key per field, so a two-key pick is two writes, and a
 * store that takes the first and refuses the second would leave the device
 * holding half a preference: the next boot paints a mode with the palette of the
 * choice before it. The module keeps the pair all-or-nothing, which is also the
 * invariant a debounced picker's diff depends on: a rejected write means the
 * SAVED preference is still the one the caller passed as `previous`.
 */
describe("appearance.setTheme when the store fails part way", () => {
  const SAVED: ThemePreference = {
    mode: "light",
    light: "catppuccin-latte",
    dark: "nord",
  };

  /** A store that refuses `set` for one key and records every write in order. */
  function brittleKv(
    map: Map<string, string>,
    refuse: (key: string) => Error | null,
  ) {
    const writes: string[] = [];
    let inFlight = 0;
    let overlapped = false;
    const store: KeyValueStore = {
      get: async (key) => map.get(key) ?? null,
      set: async (key, value) => {
        inFlight += 1;
        overlapped ||= inFlight > 1;
        await Promise.resolve();
        writes.push(key);
        const refusal = refuse(key);
        inFlight -= 1;
        if (refusal) throw refusal;
        map.set(key, value);
      },
      delete: async (key) => void map.delete(key),
    };
    return {
      store,
      writes,
      get overlapped() {
        return overlapped;
      },
    };
  }

  const seed = (): Map<string, string> =>
    new Map([
      [THEME_KEYS.mode, SAVED.mode],
      [THEME_KEYS.light, SAVED.light],
      [THEME_KEYS.dark, SAVED.dark],
    ]);

  it("writes the keys one at a time", async () => {
    const map = seed();
    const brittle = brittleKv(map, () => null);
    const { appearance } = makeSdk({}, brittle.store);

    await appearance.setTheme({ mode: "dark", dark: "gruvbox" }, SAVED);

    expect(brittle.writes).toEqual([THEME_KEYS.mode, THEME_KEYS.dark]);
    expect(
      brittle.overlapped,
      "two keys in flight at once can half-succeed with nothing to roll back",
    ).toBe(false);
  });

  it("rolls the key it did store back to the preference still saved", async () => {
    const map = seed();
    const refused = new Error("quota exceeded");
    const brittle = brittleKv(map, (key) =>
      key === THEME_KEYS.dark ? refused : null,
    );
    const { appearance } = makeSdk({}, brittle.store);

    await expect(
      appearance.setTheme({ mode: "dark", dark: "gruvbox" }, SAVED),
    ).rejects.toBe(refused);

    expect(brittle.writes).toEqual([
      THEME_KEYS.mode,
      THEME_KEYS.dark,
      THEME_KEYS.mode,
    ]);
    expect(Object.fromEntries(map)).toEqual({
      [THEME_KEYS.mode]: SAVED.mode,
      [THEME_KEYS.light]: SAVED.light,
      [THEME_KEYS.dark]: SAVED.dark,
    });
  });

  it("reads back exactly the preference the caller still holds as saved", async () => {
    const map = seed();
    const brittle = brittleKv(map, (key) =>
      key === THEME_KEYS.dark ? new Error("quota exceeded") : null,
    );
    const { appearance } = makeSdk({}, brittle.store);

    await expect(
      appearance.setTheme({ mode: "dark", dark: "gruvbox" }, SAVED),
    ).rejects.toThrow(/quota exceeded/);

    await expect(appearance.getTheme()).resolves.toEqual({
      pref: SAVED,
      unusable: [],
    });
  });

  it("names the key left ahead when the rollback is refused too", async () => {
    const map = seed();
    const refused = new Error("quota exceeded");
    const brittle = brittleKv(map, (key) =>
      key === THEME_KEYS.mode && map.get(THEME_KEYS.mode) === "dark"
        ? new Error("rollback blocked")
        : key === THEME_KEYS.dark
          ? refused
          : null,
    );
    const { appearance, logger } = makeSdk({}, brittle.store);

    // The original refusal is what the caller hears: the rollback is a repair
    // attempt, and its own failure must not mask the reason the pick was lost.
    await expect(
      appearance.setTheme({ mode: "dark", dark: "gruvbox" }, SAVED),
    ).rejects.toBe(refused);

    expect(map.get(THEME_KEYS.mode)).toBe("dark");
    expect(logger.warn).toHaveBeenCalledWith(
      "appearance: a key is left ahead of the saved preference",
      expect.objectContaining({ key: THEME_KEYS.mode }),
    );
  });
});

describe("appearance over dispatch", () => {
  it("answers the same preference the facade does", async () => {
    const { sdk } = makeSdk({ [THEME_KEYS.mode]: "system" });

    const result = await sdk.dispatch({ id: "1", type: "appearance/getTheme" });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      value: { pref: { ...DEFAULT_THEME_PREFERENCE, mode: "system" } },
    });
  });

  it("narrows an untrusted patch before writing it", async () => {
    const { sdk, device } = makeSdk();

    const ok = await sdk.dispatch({
      id: "1",
      type: "appearance/setTheme",
      payload: { mode: "dark" },
    });
    const refused = await sdk.dispatch({
      id: "2",
      type: "appearance/setTheme",
      payload: { light: "nord" },
    });

    expect(ok.ok).toBe(true);
    expect(device.get(THEME_KEYS.mode)).toBe("dark");
    expect(refused).toEqual({
      id: "2",
      ok: false,
      error: {
        message: '"nord" is not an appearance this build ships for "light"',
      },
    });
  });

  it("lists every palette it ships, each with the mode it belongs to", async () => {
    const { appearance } = makeSdk();

    const palettes = appearance.listPalettes();

    expect(palettes.length).toBeGreaterThan(1);
    expect(palettes.some((p) => p.id === DEFAULT_THEME_PREFERENCE.light)).toBe(
      true,
    );
    expect(palettes.every((p) => p.mode === "light" || p.mode === "dark")).toBe(
      true,
    );
  });
});
