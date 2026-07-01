import { invoke } from "@tauri-apps/api/core";

interface EngineConfig {
  baseUrl: string;
  token: string;
}

/**
 * Pulls the Tauri-provided Rust engine handshake when the one-shot ready event
 * raced ahead of the React listener.
 */
export async function pullEngineHandshakeWithRetry(opts: {
  hasClient: () => boolean;
  applyConfig: (config: EngineConfig) => void;
}): Promise<void> {
  const deadline = Date.now() + 60_000;
  let delay = 100;
  while (Date.now() < deadline) {
    if (opts.hasClient()) return;
    try {
      const config = await invoke<EngineConfig>("get_engine_handshake");
      if (config?.baseUrl && config?.token) {
        opts.applyConfig(config);
        return;
      }
    } catch {
      /* engine not ready yet, retry */
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 1000);
  }
  console.error("[engine] handshake pull timed out after 60s");
}
