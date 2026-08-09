import * as controlPlane from "../control-plane";
import { DEFAULT_WORKSPACE_ID } from "../synthetic";
import type { AdapterContext } from "./context";

/**
 * Translates the workspace id the UI holds into the one the SERVER answers to.
 *
 * The personal space is the SYNTHETIC "default" client-side (`workspaces-mixin`
 * replaces the served personal row with it; its id is load-bearing for prefs,
 * caches and the desktop boot path). No server speaks that vocabulary: the local
 * host's personal workspace id is its folder name (`~/.houston/workspaces/<Name>`)
 * and the gateway's is its fixed engine id ("Houston") — both answer 404
 * "workspace not found" for "default". Team spaces (`org:<slug>`) bridge through
 * with their real ids and pass through untouched.
 *
 * One resolver per client (held on {@link AdapterContext}), so the `/v1/workspaces`
 * round trip is paid once no matter how many surfaces need the translation —
 * shared skills and the sidebar layout both do.
 */
export class WorkspaceIdResolver {
  #personal: Promise<string> | undefined;

  constructor(private readonly ctx: AdapterContext) {}

  resolve(workspaceId: string): Promise<string> {
    if (workspaceId !== DEFAULT_WORKSPACE_ID)
      return Promise.resolve(workspaceId);
    this.#personal ??= (async () => {
      const rows = await controlPlane.listWorkspaces(this.ctx.prefConfig());
      const personal = rows.find((w) => !w.id.startsWith("org:"));
      if (!personal) throw new Error("The host serves no personal workspace.");
      return personal.id;
    })();
    // A transient failure must not wedge the caller for the session: drop the
    // cached rejection so the next call re-resolves.
    return this.#personal.catch((err: unknown) => {
      this.#personal = undefined;
      throw err;
    });
  }
}
