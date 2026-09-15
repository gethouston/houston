import type { HoustonSdk } from "@houston/sdk";
import type { Agent } from "@houston/wire-types";
import * as controlPlane from "../control-plane";
import { viaSdk } from "./sdk-error";

/**
 * The agent list as the app renders it: the SDK's `GET /agents`, with the
 * browser-local colour overlay reconciled against the `agent_colors` account
 * preference (PRODUCT-1344) in the same round trip.
 *
 * The reconcile rides ALONGSIDE the read rather than after it: the device
 * overlay is empty after a sign-out purge, so mapping before the account copy
 * lands would paint every agent default-purple. It also carries colours set
 * elsewhere — another device, or the assistant's `updateAgentColor` — onto this
 * one, which is what makes the list refetch an agent change triggers repaint.
 * It never rejects, so only the list read can fail here.
 */
export async function readAgentList(
  sdk: HoustonSdk,
  cp: controlPlane.ControlPlaneConfig,
): Promise<Agent[]> {
  const [wire] = await Promise.all([
    viaSdk("/agents", () => sdk.agents.list()),
    controlPlane.syncAgentColors(cp),
  ]);
  const colors = controlPlane.colorOverlay();
  return wire.map((a) => controlPlane.toUiAgent(a, colors));
}
