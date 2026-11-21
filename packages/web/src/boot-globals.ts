import type { EngineConfig } from "./engine-config";

export interface HostModeGlobals {
  __HOUSTON_CP__?: boolean;
  __HOUSTON_ENGINE__?: EngineConfig;
}

export function applyHostModeGlobals(
  target: HostModeGlobals,
  engine: EngineConfig | null,
): void {
  target.__HOUSTON_CP__ = true;
  if (engine) target.__HOUSTON_ENGINE__ = engine;
}
