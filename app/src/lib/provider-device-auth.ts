import { osIsTauri } from "./os-bridge";

/** Headless device OAuth when the active engine cannot open the local browser. */
export function providerUsesDeviceAuth(): boolean {
  return !osIsTauri();
}
