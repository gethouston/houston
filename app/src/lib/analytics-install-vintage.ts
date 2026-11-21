import { APP_VERSION } from "./analytics-bootstrap";
import { tauriPreferences } from "./tauri";

const FIRST_INSTALL_VERSION_KEY = "analytics:first_install_version";
const FIRST_INSTALL_DATE_KEY = "analytics:first_install_date";

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO).getTime();
  const b = new Date(toISO).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

export async function ensureFirstInstallProps(): Promise<{
  firstInstallVersion: string;
  firstInstallDate: string;
}> {
  const today = todayISODate();
  const existingVersion = await tauriPreferences
    .get(FIRST_INSTALL_VERSION_KEY)
    .catch(() => null);
  const existingDate = await tauriPreferences
    .get(FIRST_INSTALL_DATE_KEY)
    .catch(() => null);

  const firstInstallVersion = existingVersion ?? APP_VERSION;
  const firstInstallDate = existingDate ?? today;

  if (!existingVersion) {
    await tauriPreferences
      .set(FIRST_INSTALL_VERSION_KEY, firstInstallVersion)
      .catch(() => {});
  }
  if (!existingDate) {
    await tauriPreferences
      .set(FIRST_INSTALL_DATE_KEY, firstInstallDate)
      .catch(() => {});
  }

  return { firstInstallVersion, firstInstallDate };
}
