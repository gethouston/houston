/**
 * Web shim for `@tauri-apps/plugin-updater`.
 *
 * There is no self-managed app bundle to update in a browser tab (the page is
 * whatever the server serves). `check()` resolves to `null` ("no update
 * available"), which app/src/hooks/use-update-checker.ts already handles by
 * staying idle — so the update card never shows on web, with no errors logged.
 *
 * The `Update` shape mirrors the members use-update-checker.ts reads, so the
 * (dead-on-web) install path still type-checks against this shim.
 */

// Discriminated union mirroring the real plugin's download-progress events
// (use-update-checker.ts switches on `event.event`). Dead code on web — there
// is no install path — but kept faithful so the shim matches the contract.
export type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data: Record<string, never> };

export interface Update {
  currentVersion: string;
  version: string;
  body?: string;
  downloadAndInstall(onEvent: (event: DownloadEvent) => void): Promise<void>;
}

export async function check(): Promise<Update | null> {
  return null;
}
