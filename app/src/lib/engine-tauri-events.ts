import { listen } from "@tauri-apps/api/event";

interface EngineConfig {
  baseUrl: string;
  token: string;
}

/**
 * Installs local host-sidecar lifecycle listeners (`houston-engine-ready` /
 * `houston-engine-restarted`, emitted by the Tauri supervisor). Remote host
 * modes skip this so a local restart event can never replace a remote client.
 */
export function installEngineLifecycleListeners(opts: {
  hasClient: () => boolean;
  applyConfig: (config: EngineConfig) => void;
  resetWebSocket: () => void;
  notifyRestarted: () => void;
}): void {
  listen<EngineConfig>("houston-engine-ready", (ev) => {
    if (!opts.hasClient()) {
      opts.applyConfig(ev.payload);
    }
  }).catch(() => {
    /* non-Tauri environment */
  });

  listen<EngineConfig>("houston-engine-restarted", (ev) => {
    opts.applyConfig(ev.payload);
    opts.resetWebSocket();
    opts.notifyRestarted();
  }).catch(() => {
    /* non-Tauri environment */
  });
}
