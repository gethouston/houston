import { listen } from "@tauri-apps/api/event";

interface EngineConfig {
  baseUrl: string;
  token: string;
}

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
  }).catch(() => {});

  listen<EngineConfig>("houston-engine-restarted", (ev) => {
    opts.applyConfig(ev.payload);
    opts.resetWebSocket();
    opts.notifyRestarted();
  }).catch(() => {});
}
