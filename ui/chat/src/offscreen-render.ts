/**
 * Native rendering virtualization (HOU-819): `content-visibility: auto` lets
 * the browser skip layout/paint for messages outside the viewport — a long
 * loaded window costs its on-screen slice, not its full markdown render.
 * `contain-intrinsic-size`'s `auto` keeps the last rendered height once
 * measured (the 9rem estimate only sizes never-rendered items), so scroll
 * geometry stays stable. Engines without support simply ignore both — the
 * list renders exactly as before.
 *
 * Apply on each message ROOT, never a wrapper: containment clips descendant
 * outlines, and the search highlight draws an outline on that very element.
 */
export const OFFSCREEN_RENDER_SKIP =
  "[content-visibility:auto] [contain-intrinsic-size:auto_9rem]";
