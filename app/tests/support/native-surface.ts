// Puts the test inside a store app the way the mobile shell's boot does
// (`window.__HOUSTON_SURFACE__`, read by `osNativeMobilePlatform`), and back.
// Works with or without jsdom: a bare node run gets a stand-in `window`.

type Surface = "ios" | "android";
type SurfaceWindow = { __HOUSTON_SURFACE__?: Surface };

const g = globalThis as unknown as { window?: SurfaceWindow };

/** Enter a store app; returns the function that leaves it. */
export function enterNativeApp(surface: Surface = "ios"): () => void {
  const hadWindow = g.window !== undefined;
  const target = g.window ?? {};
  g.window = target;
  target.__HOUSTON_SURFACE__ = surface;
  return () => {
    delete target.__HOUSTON_SURFACE__;
    if (!hadWindow) delete g.window;
  };
}
