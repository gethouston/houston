import { tauriPreferences } from "./tauri";

const INSTALL_ID_KEY = "install_id";

let cached: { id: string; isNew: boolean } | null = null;

export async function getInstallId(): Promise<{ id: string; isNew: boolean }> {
  if (cached) return cached;

  const existing = await tauriPreferences.get(INSTALL_ID_KEY).catch(() => null);
  if (existing) {
    cached = { id: existing, isNew: false };
    return cached;
  }

  const id = crypto.randomUUID();
  await tauriPreferences.set(INSTALL_ID_KEY, id).catch(() => {});
  cached = { id, isNew: true };
  return cached;
}
