import { normalizeSidebarLayout } from "@houston/protocol";
import type { SidebarLayout } from "@houston/wire-types";
import { reportAdapterError } from "../error-sink";
import type { AdapterContext } from "./context";
import { HoustonEngineError } from "./errors";
import { getCapabilities } from "./host-capabilities";
import { viaSdk } from "./sdk-error";
import { teamSlugFromWorkspaceId } from "./workspaces-mixin";

const layoutPath = (workspaceId: string) =>
  `/v1/workspaces/${encodeURIComponent(workspaceId)}/sidebar-layout`;
const deviceKey = (workspaceId: string) =>
  `houston.sidebar-layout.${workspaceId}`;

const isEmpty = (layout: SidebarLayout) =>
  layout.groups.length === 0 && layout.order.length === 0;

/**
 * Device storage can refuse every access (a SecurityError under blocked site
 * data): that is reported and read as "nothing stored", so the server layout
 * still answers.
 */
function readDeviceRaw(workspaceId: string): string | null {
  try {
    // Inside the try: a blocked page throws on the `localStorage` read itself.
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(deviceKey(workspaceId));
  } catch (error) {
    reportAdapterError("sidebar-layout.device-storage", error);
    return null;
  }
}

function parseDeviceLayout(raw: string): SidebarLayout | null {
  try {
    return normalizeSidebarLayout(JSON.parse(raw));
  } catch (error) {
    reportAdapterError("sidebar-layout.device-layout-unreadable", error);
    return null;
  }
}

function clearDeviceLayout(workspaceId: string): void {
  try {
    localStorage.removeItem(deviceKey(workspaceId));
  } catch (error) {
    reportAdapterError("sidebar-layout.device-storage", error);
  }
}

/** The host or gateway owns each person's workspace sidebar layout. */
export class SidebarLayoutStore {
  #localProfile: Promise<boolean> | undefined;
  constructor(private readonly ctx: AdapterContext) {}

  /** Null when the probe failed: the caller skips the lift and asks again. */
  private async isLocal(): Promise<boolean | null> {
    this.#localProfile ??= getCapabilities(this.ctx).then(
      (caps) => caps.profile === "local",
    );
    try {
      return await this.#localProfile;
    } catch (error) {
      this.#localProfile = undefined;
      reportAdapterError("sidebar-layout.capabilities", error);
      return null;
    }
  }

  private sdkFor(workspaceId: string) {
    return this.ctx.sdkForSpace(teamSlugFromWorkspaceId(workspaceId))
      .workspaces;
  }

  async get(workspaceId: string): Promise<SidebarLayout> {
    const wireId = await this.ctx.workspaceIds.resolve(workspaceId);
    const hosted = await viaSdk(layoutPath(wireId), () =>
      this.sdkFor(wireId).getSidebarLayout(wireId),
    );
    const local = await this.isLocal();
    if (local === null) return hosted;
    const raw = readDeviceRaw(workspaceId);
    if (raw === null) return hosted;
    const device = local ? parseDeviceLayout(raw) : null;
    if (!device || !isEmpty(hosted) || isEmpty(device)) {
      clearDeviceLayout(workspaceId);
      return hosted;
    }
    try {
      const seeded = await viaSdk(layoutPath(wireId), () =>
        this.sdkFor(wireId).setSidebarLayout(wireId, device),
      );
      clearDeviceLayout(workspaceId);
      return seeded;
    } catch (error) {
      // A refused device copy can never be lifted, so it is dropped rather
      // than retried on every read; any other failure keeps it for next time.
      if (
        !(error instanceof HoustonEngineError) ||
        error.status < 400 ||
        error.status >= 500
      )
        throw error;
      reportAdapterError("sidebar-layout.device-seed-refused", error);
      clearDeviceLayout(workspaceId);
      return hosted;
    }
  }

  async set(
    workspaceId: string,
    layout: SidebarLayout,
  ): Promise<SidebarLayout> {
    const wireId = await this.ctx.workspaceIds.resolve(workspaceId);
    return viaSdk(layoutPath(wireId), () =>
      this.sdkFor(wireId).setSidebarLayout(wireId, layout),
    );
  }
}
