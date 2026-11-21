export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
}

export interface Viewport {
  w: number;
  h: number;
}

const GAP = 16;
const MARGIN = 16;

const clamp = (min: number, v: number, max: number) =>
  Math.max(min, Math.min(v, max));

export interface CardSize {
  w: number;
  h: number;
}

function placeBeside(
  rect: Rect,
  vw: number,
  vh: number,
  size: CardSize,
): Placement | null {
  const clampTop = (y: number) => clamp(MARGIN, y, vh - size.h - MARGIN);
  const clampLeft = (x: number) => clamp(MARGIN, x, vw - size.w - MARGIN);
  const right = rect.left + rect.width + GAP;
  if (right + size.w + MARGIN <= vw)
    return { top: clampTop(rect.top), left: right };
  if (rect.left - GAP - size.w >= MARGIN)
    return { top: clampTop(rect.top), left: rect.left - GAP - size.w };
  const centeredLeft = clampLeft(rect.left + rect.width / 2 - size.w / 2);
  const below = rect.top + rect.height + GAP;
  if (below + size.h + MARGIN <= vh) return { top: below, left: centeredLeft };
  if (rect.top - GAP - size.h >= MARGIN)
    return { top: rect.top - GAP - size.h, left: centeredLeft };
  return null;
}

export function placeCard(args: {
  hole: Rect | null;
  dialogRect: Rect | null;
  viewport: Viewport;
  inDialog: boolean;
  size: CardSize;
}): Placement {
  const { hole, dialogRect, viewport, inDialog, size } = args;
  return (
    (inDialog && dialogRect
      ? placeBeside(dialogRect, viewport.w, viewport.h, size)
      : null) ??
    (hole ? placeBeside(hole, viewport.w, viewport.h, size) : null) ?? {
      top: viewport.h / 2 - size.h / 2,
      left: clamp(MARGIN, viewport.w / 2 - size.w / 2, viewport.w - size.w),
    }
  );
}

export function blockerPanels(hole: Rect | null, viewport: Viewport): Rect[] {
  if (!hole)
    return [{ top: 0, left: 0, width: viewport.w, height: viewport.h }];
  return [
    { top: 0, left: 0, width: viewport.w, height: Math.max(0, hole.top) },
    {
      top: hole.top + hole.height,
      left: 0,
      width: viewport.w,
      height: Math.max(0, viewport.h - hole.top - hole.height),
    },
    {
      top: hole.top,
      left: 0,
      width: Math.max(0, hole.left),
      height: hole.height,
    },
    {
      top: hole.top,
      left: hole.left + hole.width,
      width: Math.max(0, viewport.w - hole.left - hole.width),
      height: hole.height,
    },
  ];
}
