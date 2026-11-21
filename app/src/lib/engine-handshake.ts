import { osEngineHandshake } from "./os-bridge";

interface EngineConfig {
  baseUrl: string;
  token: string;
}

export async function pullEngineHandshakeWithRetry(opts: {
  hasClient: () => boolean;
  applyConfig: (config: EngineConfig) => void;
}): Promise<void> {
  const deadline = Date.now() + 60_000;
  let delay = 100;
  while (Date.now() < deadline) {
    if (opts.hasClient()) return;
    try {
      const config: EngineConfig = await osEngineHandshake();
      if (config?.baseUrl && config?.token) {
        opts.applyConfig(config);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 1000);
  }
  console.error("[engine] handshake pull timed out after 60s");
}
