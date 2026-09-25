import type { ProvisioningEntry } from "../../lib/agent-provisioning/entry";
import { reportError } from "../../lib/error-report";

const STORAGE_KEY = "houston.agent-provisioning";

/** localStorage access, surfaced to Sentry (no toast — nothing user-blocking
 *  fails here, but a broken mirror must not stay invisible in beta). */
export function storageRead(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    reportError("agent_provisioning_storage", "reading the mirror failed", e);
    return null;
  }
}

export function storageWrite(state: Record<string, ProvisioningEntry>): void {
  try {
    const entries = Object.values(state);
    if (entries.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    reportError("agent_provisioning_storage", "writing the mirror failed", e);
  }
}
