import { isTauri } from "@tauri-apps/api/core";
import {
  type Event,
  emit,
  listen,
  type UnlistenFn,
} from "@tauri-apps/api/event";

export function osIsTauri(): boolean {
  return isTauri();
}

export type NativeMobilePlatform = "ios" | "android";

declare global {
  interface Window {
    __HOUSTON_SURFACE__?: NativeMobilePlatform;
  }
}

export function osNativeMobilePlatform(): NativeMobilePlatform | null {
  if (typeof window === "undefined") return null;
  return window.__HOUSTON_SURFACE__ ?? null;
}

export function osIsNativeMobile(): boolean {
  return osNativeMobilePlatform() !== null;
}

export function osCanOpenUrlUnprompted(): boolean {
  if (osIsTauri() || osIsNativeMobile()) return true;
  return globalThis.navigator?.userActivation?.isActive !== false;
}

export function legacyListen<T>(
  event: string,
  handler: (ev: Event<T>) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, handler);
}

export function legacyEmit(event: string, payload?: unknown): Promise<void> {
  return emit(event, payload);
}
