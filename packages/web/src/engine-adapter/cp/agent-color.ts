// Color is a client-side cosmetic the control plane intentionally does not store
// (its model is id/name only). Keep a tiny local overlay so the UI's per-agent
// color survives reloads without bloating the server model.
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
  } catch {
    /* storage disabled — color just falls back to the default */
  }
}
export function setColor(agentId: string, color: string): void {
  writeOverlay({ ...colorOverlay(), [agentId]: color });
}
export function moveColor(fromId: string, toId: string): void {
  writeOverlay(renameColorOverlay(colorOverlay(), fromId, toId));
}
export function clearColor(agentId: string): void {
  writeOverlay(removeColorOverlay(colorOverlay(), agentId));
}

/**
 * Carry an agent's overlay color from its old id to its new one. The local store
 * derives an agent's id from its on-disk path (`<Workspace>/<Name>`), so renaming
 * an agent changes its id; without this the renamed agent's avatar silently
 * reverts to the default color. No-op when the id is unchanged (stable-id
 * servers) or the agent had no color. Pure so it can be unit-tested without
 * localStorage.
 */
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

/**
 * Drop an agent's overlay entry on delete, so a future agent that reuses the same
 * path-derived id can't inherit a dead color. No-op when absent. Pure.
 */
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
