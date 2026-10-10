import type { createHostBase } from "./host-base";
import type { createHostDaemons } from "./host-daemons";
import type { createHostHeartbeat } from "./host-heartbeat";
import type { createHostIntegrations } from "./host-integrations";
import type { createHostRuntime } from "./host-runtime";
import type { createHostServer } from "./host-server";

export type LocalHostState = ReturnType<typeof createHostBase> &
  ReturnType<typeof createHostRuntime> &
  ReturnType<typeof createHostIntegrations> &
  ReturnType<typeof createHostHeartbeat> &
  ReturnType<typeof createHostServer> &
  ReturnType<typeof createHostDaemons>;
