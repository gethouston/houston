import {
  docKey,
  keepHostOwnedConfig,
  loadConfig,
  saveConfig,
  saveJson,
  withDocLock,
} from "@houston/domain";
import type { Vfs } from "../vfs";

/**
 * The ONE lock every host-side config write takes, so the first-day start's
 * load → merge → save and a surface's whole-config write never interleave.
 */
export function withConfigLock<T>(
  root: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withDocLock(`${root}#config`, fn);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Store a whole config a surface sent, keeping the host-owned first-day fields
 * as they stand (`keepHostOwnedConfig`). A body that is not a JSON object is
 * stored as sent: the read side already reports and tolerates it, and there
 * is nothing in it to keep.
 */
export function writeSurfaceConfig(
  vfs: Vfs,
  root: string,
  incoming: unknown,
): Promise<unknown> {
  return withConfigLock(root, async () => {
    if (!isRecord(incoming)) {
      await saveJson(vfs, docKey(root, "config"), incoming);
      return incoming;
    }
    const { config } = await loadConfig(vfs, root);
    const next = keepHostOwnedConfig(incoming, config);
    await saveConfig(vfs, root, next);
    return next;
  });
}

/** The JSON object a document holds, or null when it holds anything else. */
function objectIn(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * {@link writeSurfaceConfig} for the raw document route, which carries text:
 * a document that already agrees with the host-owned fields (or is not a JSON
 * object at all) is stored byte for byte, as sent.
 */
export function writeSurfaceConfigText(
  vfs: Vfs,
  root: string,
  key: string,
  content: string,
): Promise<void> {
  return withConfigLock(root, async () => {
    const incoming = objectIn(content);
    if (!incoming) return vfs.writeText(key, content);
    const { config } = await loadConfig(vfs, root);
    const next = keepHostOwnedConfig(incoming, config);
    if (next === incoming) await vfs.writeText(key, content);
    else await saveConfig(vfs, root, next);
  });
}
