import { PreferencesClient } from "@houston/runtime-client";
import { withoutAuthReplay } from "../../auth-replay";
import type { ModuleContext } from "../../module-context";
import {
  WorkspacePreferenceIdentityChanged,
  WorkspacePreferenceTimeout,
} from "./workspace-selection-errors";

/** Bounds the whole response, including its body, even if transport ignores abort. */
export async function workspacePreferenceRequest<T>(
  ctx: ModuleContext,
  valid: () => boolean,
  timeoutMs: number,
  work: (client: PreferencesClient) => Promise<T>,
): Promise<T> {
  const { clock, fetch } = ctx.config.ports;
  const controller = new AbortController();
  let timer = 0;
  const deadline = new Promise<never>((_, reject) => {
    timer = clock.setTimeout(() => {
      reject(new WorkspacePreferenceTimeout());
      controller.abort();
    }, timeoutMs);
  });
  const client = new PreferencesClient({
    baseUrl: ctx.config.baseUrl,
    fetch: (input, init) => {
      if (!valid()) throw new WorkspacePreferenceIdentityChanged();
      return fetch(
        input,
        withoutAuthReplay({ ...init, signal: controller.signal }, () => {
          if (!valid()) throw new WorkspacePreferenceIdentityChanged();
        }),
      );
    },
  });
  try {
    return await Promise.race([work(client), deadline]);
  } finally {
    clock.clearTimeout(timer);
  }
}
