type Surface = "ios" | "android";
type SurfaceWindow = { __HOUSTON_SURFACE__?: Surface };

const g = globalThis as unknown as { window?: SurfaceWindow };

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
