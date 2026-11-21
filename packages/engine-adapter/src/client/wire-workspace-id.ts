import { DEFAULT_WORKSPACE_ID } from "../synthetic";
import type { AdapterContext } from "./context";
import { viaSdk } from "./sdk-error";

export class WorkspaceIdResolver {
  #personal: Promise<string> | undefined;

  constructor(private readonly ctx: AdapterContext) {}

  resolve(workspaceId: string): Promise<string> {
    if (workspaceId !== DEFAULT_WORKSPACE_ID)
      return Promise.resolve(workspaceId);
    this.#personal ??= (async () => {
      const rows = await viaSdk("/v1/workspaces", () =>
        this.ctx.sdk.workspaces.listWorkspaces(),
      );
      const personal = rows.find((w) => !w.id.startsWith("org:"));
      if (!personal) throw new Error("The host serves no personal workspace.");
      return personal.id;
    })();
    return this.#personal.catch((err: unknown) => {
      this.#personal = undefined;
      throw err;
    });
  }
}
