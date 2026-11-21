const COLOR_KEY = "houston.web.cp.agentColors";
export function colorOverlay(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(COLOR_KEY) || "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}
function writeOverlay(overlay: Record<string, string>): void {
  try {
    localStorage.setItem(COLOR_KEY, JSON.stringify(overlay));
  } catch {}
}

let onOverlayWrite: (() => void) | null = null;
export function setOverlayWriteListener(listener: (() => void) | null): void {
  onOverlayWrite = listener;
}

export function overwriteColorOverlay(next: Record<string, string>): void {
  writeOverlay(next);
}

export function setColor(agentId: string, color: string): void {
  writeOverlay({ ...colorOverlay(), [agentId]: color });
  onOverlayWrite?.();
}
export function moveColor(fromId: string, toId: string): void {
  writeOverlay(renameColorOverlay(colorOverlay(), fromId, toId));
  onOverlayWrite?.();
}
export function clearColor(agentId: string): void {
  writeOverlay(removeColorOverlay(colorOverlay(), agentId));
  onOverlayWrite?.();
}

export function renameColorOverlay(
  overlay: Record<string, string>,
  fromId: string,
  toId: string,
): Record<string, string> {
  if (fromId === toId) return overlay;
  const color = overlay[fromId];
  if (color === undefined) return overlay;
  const next: Record<string, string> = {};
  for (const [id, c] of Object.entries(overlay)) {
    if (id !== fromId) next[id] = c;
  }
  next[toId] = color;
  return next;
}

export function removeColorOverlay(
  overlay: Record<string, string>,
  id: string,
): Record<string, string> {
  if (!(id in overlay)) return overlay;
  const next: Record<string, string> = {};
  for (const [k, c] of Object.entries(overlay)) {
    if (k !== id) next[k] = c;
  }
  return next;
}
