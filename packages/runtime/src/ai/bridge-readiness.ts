import type { ManagedBridgeEndpoint } from "@houston/protocol";
import { currentActingContext } from "../session/acting-context";
import { probeBridge } from "./local-model-transport";

// A verdict belongs to this authenticated HTTP/turn context only. Another user
// or a renewed generation must probe again, even when its display URL is identical.
const verdicts = new WeakMap<object, Map<string, boolean>>();
const key = (bridge: ManagedBridgeEndpoint, model: string) =>
  `${bridge.id}:${model}`;
export async function refreshBridgeReadiness(
  bridge: ManagedBridgeEndpoint,
  model: string,
) {
  const context = currentActingContext();
  if (!context?.actingAs) return false;
  const ok = await probeBridge(bridge, model);
  let values = verdicts.get(context);
  if (!values) {
    values = new Map();
    verdicts.set(context, values);
  }
  values.set(key(bridge, model), ok);
  return ok;
}
export function bridgeReadiness(bridge: ManagedBridgeEndpoint, model: string) {
  const context = currentActingContext();
  return context
    ? verdicts.get(context)?.get(key(bridge, model)) === true
    : false;
}
