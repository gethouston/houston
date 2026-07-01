import { listen } from "@tauri-apps/api/event";

interface EngineConfig {
  baseUrl: string;
  token: string;
}

/**
 * Installs Rust-engine lifecycle listeners. Host modes skip this so a Rust
 * restart event can never replace a v3 host client.
 */
export function installRustEngineLifecycleListeners(opts: {
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
