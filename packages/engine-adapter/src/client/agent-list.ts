import type { HoustonSdk } from "@houston/sdk";
import type { Agent } from "@houston/wire-types";
import * as controlPlane from "../control-plane";
import { viaSdk } from "./sdk-error";

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
