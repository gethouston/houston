import type { SidebarLayout } from "../../../../../ui/engine-client/src/types";
import * as controlPlane from "../control-plane";
import type { AdapterContext } from "./context";
import { HoustonEngineError } from "./errors";
import { fetchCapabilities } from "./host-capabilities";

const SIDEBAR_LAYOUT_PREF = "houston.sidebar-layout";

const EMPTY_SIDEBAR_LAYOUT: SidebarLayout = {
  groups: [],
  ungroupedOrder: [],
};

const localKey = (workspaceId: string) =>
  `${SIDEBAR_LAYOUT_PREF}.${workspaceId}`;

function readLocalSidebarLayout(workspaceId: string): SidebarLayout {
  try {
    const raw = localStorage.getItem(localKey(workspaceId));
    return raw ? (JSON.parse(raw) as SidebarLayout) : EMPTY_SIDEBAR_LAYOUT;
  } catch {
    return EMPTY_SIDEBAR_LAYOUT;
  }
}

function writeLocalSidebarLayout(workspaceId: string, layout: SidebarLayout) {
  try {
    localStorage.setItem(localKey(workspaceId), JSON.stringify(layout));
  } catch {
    /* storage disabled */
  }
}

function clearLocalSidebarLayout(workspaceId: string) {
  try {
    localStorage.removeItem(localKey(workspaceId));
  } catch {
    /* storage disabled */
  }
}

/**
 * Is this layout indistinguishable from one that was never written? Not just
 * `groups.length === 0`: a drag order, a folded default block, or the default
 * team's shared context are all real state a seed must never clobber.
 */
export function isEmptySidebarLayout(layout: SidebarLayout): boolean {
  return (
    layout.groups.length === 0 &&
    layout.ungroupedOrder.length === 0 &&
    !layout.defaultContext?.trim() &&
    layout.defaultCollapsed !== true
  );
}

/**
 * Should this device's stored layout be lifted UP to the host? Exactly one
 * situation qualifies: the host holds nothing at all while this device holds
 * something — the arrangement a user built while the client was localStorage-only.
 *
 * Deliberately one-directional and one-shot. It never runs the other way (a host
 * layout is never copied down to become a future seed), and because a successful
 * seed leaves the host non-empty AND drops the device copy, it cannot fire twice.
 */
export function shouldSeedHostLayout(
  hosted: SidebarLayout,
  local: SidebarLayout,
): boolean {
  return isEmptySidebarLayout(hosted) && !isEmptySidebarLayout(local);
}

/**
 * Where the sidebar's order + grouping actually lives, per deployment.
 *
 * **The host owns it wherever the host serves it.** Desktop sidecar and
 * self-host both run the OPEN host, which persists the layout as the
 * `sidebar_layout` preference AND — the whole point — diffs each agent's
 * resolved team context on the PUT to mirror it into that agent's `GROUP.md`
 * (`routes/group-context-sync.ts`). While this adapter kept the layout in
 * `localStorage` only, that fan-out never ran: a team's shared context was
 * stored and never delivered, on every local deployment.
 *
 * **The gateway-fronted cloud does not serve the route** (its `/v1/workspaces/{id}`
 * handler is single-segment, so the layout path 404s), and its teams are
 * SERVER-owned: there the layout is only a per-user ordering overlay (C13) and
 * context reaches agents through the gateway's own pod writes. So it stays on
 * the device, exactly as before.
 *
 * The predicate is `capabilities.profile` — the server describing itself. No
 * build-time flag can stand in: the desktop shell sets `window.__HOUSTON_CP__`
 * on EVERY delivery path (HOU-546), so `ctx.cp` is non-null for the local
 * sidecar too and says nothing about which server is on the other end.
 *
 * A 404 from either verb DEGRADES the session to `localStorage` (loud once, no
 * toast loop): that is a host predating the route — the stale-sidecar case the
 * original localStorage-only choice defended against. Every other failure
 * surfaces, because a layout write that silently vanished is worse than a toast.
 */
export class SidebarLayoutStore {
  #hostBacked: Promise<boolean> | undefined;
  #degraded = false;

  constructor(private readonly ctx: AdapterContext) {}

  async get(workspaceId: string): Promise<SidebarLayout> {
    if (!(await this.hostBacked())) return readLocalSidebarLayout(workspaceId);
    const cfg = this.ctx.prefConfig();
    const wireId = await this.ctx.workspaceIds.resolve(workspaceId);
    let hosted: SidebarLayout;
    try {
      hosted = await controlPlane.getHostSidebarLayout(cfg, wireId);
    } catch (err) {
      if (this.degradeOn(err)) return readLocalSidebarLayout(workspaceId);
      throw err;
    }
    const local = readLocalSidebarLayout(workspaceId);
    if (!shouldSeedHostLayout(hosted, local)) return hosted;
    try {
      const seeded = await controlPlane.putHostSidebarLayout(
        cfg,
        wireId,
        local,
      );
      // Only now: the arrangement lives on the host, and a leftover device copy
      // is what would re-seed it if the user ever emptied their sidebar.
      clearLocalSidebarLayout(workspaceId);
      return seeded;
    } catch (err) {
      // The read worked, the lift did not. Serve what the user actually has and
      // leave the device copy in place — the host is still empty, so the next
      // boot retries. Never throws: this sits on the sidebar's first paint.
      console.warn("[sidebar-layout] could not seed the host layout", err);
      return local;
    }
  }

  async set(
    workspaceId: string,
    layout: SidebarLayout,
  ): Promise<SidebarLayout> {
    if (!(await this.hostBacked())) {
      writeLocalSidebarLayout(workspaceId, layout);
      return layout;
    }
    const cfg = this.ctx.prefConfig();
    const wireId = await this.ctx.workspaceIds.resolve(workspaceId);
    try {
      return await controlPlane.putHostSidebarLayout(cfg, wireId, layout);
    } catch (err) {
      if (!this.degradeOn(err)) throw err;
      writeLocalSidebarLayout(workspaceId, layout);
      return layout;
    }
  }

  /** Does the layout PUT reach an open host? Probed once per client. */
  private hostBacked(): Promise<boolean> {
    if (this.#degraded) return Promise.resolve(false);
    this.#hostBacked ??= fetchCapabilities(this.ctx)
      .then((caps) => caps.profile === "local")
      .catch((err) => {
        // Unknown deployment: keep the layout on this device for THIS call and
        // forget the answer, so the next call probes again instead of pinning a
        // guess for the session.
        console.warn("[sidebar-layout] capabilities probe failed", err);
        this.#hostBacked = undefined;
        return false;
      });
    return this.#hostBacked;
  }

  /** Flip to device-local storage when the host has no such route (404), once. */
  private degradeOn(err: unknown): boolean {
    if (!(err instanceof HoustonEngineError) || err.status !== 404)
      return false;
    if (!this.#degraded) {
      this.#degraded = true;
      console.warn(
        "[sidebar-layout] this host does not serve /v1/workspaces/:id/sidebar-layout — keeping the sidebar arrangement on this device only",
      );
    }
    return true;
  }
}
