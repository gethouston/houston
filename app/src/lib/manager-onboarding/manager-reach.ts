import type { Capabilities } from "@houston/engine-adapter";
import { integrationsSupported } from "../../components/integrations/model.ts";
import { hasSpaces } from "../org-roles.ts";
import type { ManagerReach } from "./script-types.ts";

export function managerReach(capabilities: Capabilities | null): ManagerReach {
  return {
    invite: hasSpaces(capabilities),
    connect: integrationsSupported(capabilities),
  };
}
