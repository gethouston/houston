import { logAndReportError } from "./error-report";
import { tauriPreferences } from "./tauri";

export async function readBootPreference(key: string): Promise<string | null> {
  try {
    return await tauriPreferences.get(key);
  } catch (error) {
    logAndReportError(`device_pref_unreadable:${key}`, error);
    return null;
  }
}
