import type { ModuleContext } from "../../module-context";

export const WORKSPACE_SELECTION_KEY = "last_workspace_id";
export interface DeviceWorkspaceSelection {
  value: string;
  accountWriteSucceeded: boolean;
}

/** Account-scoped device data cannot follow a different person on this browser. */
export function workspaceSelectionDevice(
  ctx: ModuleContext,
  identity: string | null,
) {
  const {
    devicePreferences: device,
    logger,
    reportPreferenceError,
  } = ctx.config.ports;
  const scope =
    identity === null
      ? ""
      : `:${encodeURIComponent(ctx.config.baseUrl)}:${encodeURIComponent(identity)}`;
  const mirror = `${WORKSPACE_SELECTION_KEY}.device${scope}`;
  async function local<T>(operation: () => Promise<T>): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      if (reportPreferenceError) reportPreferenceError("device", error);
      else
        logger.error("workspace preference device mirror unavailable", {
          error,
        });
      return null;
    }
  }
  async function previous(): Promise<DeviceWorkspaceSelection | null> {
    return local(async () => {
      const raw = await device.get(mirror);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "value" in parsed &&
        typeof parsed.value === "string" &&
        "accountWriteSucceeded" in parsed &&
        typeof parsed.accountWriteSucceeded === "boolean"
      )
        return {
          value: parsed.value,
          accountWriteSucceeded: parsed.accountWriteSucceeded,
        };
      throw new Error("Invalid device workspace selection");
    });
  }
  async function remember(
    value: string | null,
    accountWriteSucceeded?: boolean,
  ): Promise<void> {
    if (value === null) {
      await local(() => device.delete(mirror));
      return;
    }
    const stored =
      accountWriteSucceeded === undefined ? await previous() : null;
    const succeeded =
      accountWriteSucceeded ??
      (stored?.value === value ? stored.accountWriteSucceeded : true);
    await local(() =>
      device.set(
        mirror,
        JSON.stringify({ value, accountWriteSucceeded: succeeded }),
      ),
    );
  }
  return {
    remember,
    async read(): Promise<DeviceWorkspaceSelection | null> {
      let stored = await previous();
      const legacy = await local(() => device.get(WORKSPACE_SELECTION_KEY));
      if (legacy !== null) {
        if (!stored && legacy.startsWith("org:")) {
          stored = { value: legacy, accountWriteSucceeded: true };
          await remember(legacy, true);
        }
        await local(() => device.delete(WORKSPACE_SELECTION_KEY));
      }
      return stored;
    },
  };
}
