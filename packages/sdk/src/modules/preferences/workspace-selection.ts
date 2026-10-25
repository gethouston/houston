import { isUnauthorized } from "../../auth-expiry";
import type { ModuleContext } from "../../module-context";
import { resolveActiveWorkspace } from "../workspaces/selection";
import type { Workspace } from "../workspaces/types";
import {
  WORKSPACE_SELECTION_KEY,
  workspaceSelectionDevice,
} from "./workspace-selection-device";
import {
  WorkspacePreferenceIdentityChanged,
  WorkspacePreferenceUnavailable,
} from "./workspace-selection-errors";
import { workspacePreferenceRequest } from "./workspace-selection-request";
import { WorkspaceSelectionState } from "./workspace-selection-state";

export { WORKSPACE_SELECTION_KEY } from "./workspace-selection-device";

/** Boot only reads; deliberate choices write in identity-bound order. */
export function workspaceSelectionPreference(ctx: ModuleContext) {
  const state =
    ctx.config.ports.workspaceSelection ?? new WorkspaceSelectionState();
  const user = () => ctx.config.ports.userId?.() ?? null;
  const device = () => workspaceSelectionDevice(ctx, user());
  const read = async (valid: () => boolean) => {
    const local = device();
    const previous = await local.read();
    try {
      const account = await workspacePreferenceRequest(
        ctx,
        valid,
        10_000,
        (client) => client.getPreference(WORKSPACE_SELECTION_KEY),
      );
      if (!valid()) throw new WorkspacePreferenceIdentityChanged();
      return {
        account,
        deviceFirst: previous?.accountWriteSucceeded === false,
        device: previous?.value ?? null,
      };
    } catch (cause) {
      if (!valid()) throw new WorkspacePreferenceIdentityChanged();
      if (
        isUnauthorized(cause) ||
        cause instanceof WorkspacePreferenceIdentityChanged
      )
        throw cause;
      throw new WorkspacePreferenceUnavailable(
        "read",
        previous?.value ?? null,
        cause,
      );
    }
  };
  return {
    remember: (value: string | null) => device().remember(value),
    async resolve<T extends Pick<Workspace, "id" | "isDefault" | "kind">>(
      input: readonly T[] | Promise<readonly T[]>,
    ): Promise<T | null> {
      const local = device();
      const generation = state.bind(user());
      const valid = () => state.bind(user()) === generation;
      // The list and account read overlap; an unused result is always handled.
      const account = read(valid).then(
        (selection) => ({ selection }),
        (error: unknown) => ({ error }),
      );
      const workspaces = await input;
      if (!valid()) throw new WorkspacePreferenceIdentityChanged();
      let current: T | null;
      try {
        const result = workspaces.some(
          (w) => w.kind === "org" || w.id.startsWith("org:"),
        )
          ? await account
          : { selection: { account: null, device: null, deviceFirst: false } };
        if (!valid()) throw new WorkspacePreferenceIdentityChanged();
        if ("error" in result) throw result.error;
        const { selection } = result;
        current = resolveActiveWorkspace(
          workspaces,
          selection.deviceFirst ? selection.device : selection.account,
          selection.deviceFirst ? selection.account : selection.device,
        );
      } catch (error) {
        if (isUnauthorized(error)) ctx.authExpiry.notifyExpired();
        if (error instanceof WorkspacePreferenceIdentityChanged) throw error;
        const { reportPreferenceError, logger } = ctx.config.ports;
        if (reportPreferenceError) reportPreferenceError("read", error);
        else logger.error("workspace preference read unavailable", { error });
        current = resolveActiveWorkspace(
          workspaces,
          error instanceof WorkspacePreferenceUnavailable
            ? error.fallback
            : (await local.read())?.value,
        );
      }
      if (!valid()) throw new WorkspacePreferenceIdentityChanged();
      await local.remember(current?.id ?? null);
      if (!valid()) throw new WorkspacePreferenceIdentityChanged();
      return current;
    },
    set(value: string | null): Promise<string | null> {
      const local = device();
      const choice = ++state.choice;
      const remembered = local.remember(value, false);
      return state.enqueue(user, async (valid) => {
        await remembered;
        const stored = await workspacePreferenceRequest(
          ctx,
          valid,
          15_000,
          (client) => client.setPreference(WORKSPACE_SELECTION_KEY, value),
        );
        if (valid() && state.choice === choice)
          await local.remember(value, true);
        return stored;
      });
    },
  };
}
