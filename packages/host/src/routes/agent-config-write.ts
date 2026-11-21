import {
  docKey,
  keepHostOwnedConfig,
  loadConfig,
  saveConfig,
  saveJson,
  withDocLock,
} from "@houston/domain";
import type { Vfs } from "../vfs";

export function withConfigLock<T>(
  root: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withDocLock(`${root}#config`, fn);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

function objectIn(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

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
