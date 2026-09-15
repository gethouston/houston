import {
  type AssistantToolOptions,
  makeAssistantCallTool,
} from "./assistant-call";
import { makeRequestCredentialTool } from "./request-credential";

/** Uses the coordinator's catalogued read, preserving its existing host scope. */
export function makeCoordinatorCredentialTool(options: AssistantToolOptions) {
  const read = makeAssistantCallTool(options);
  return makeRequestCredentialTool({
    async status(slug, signal, context) {
      const result = await read.execute(
        "credential-preflight",
        { operation: "customIntegrations", params: {} },
        signal,
        undefined,
        context,
      );
      if (!result.details.ok) throw new Error(result.details.error.message);
      const content = result.content.find((item) => item.type === "text");
      const payload: unknown =
        content?.type === "text" ? JSON.parse(content.text) : null;
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("items" in payload) ||
        !Array.isArray(payload.items)
      )
        throw new Error(
          "Houston returned an unreadable custom integration list.",
        );
      const target: unknown = payload.items.find(
        (entry: unknown) =>
          typeof entry === "object" &&
          entry !== null &&
          "slug" in entry &&
          entry.slug === slug,
      );
      if (!target) return null;
      if (typeof target !== "object" || !("state" in target))
        throw new Error(
          "Houston returned an unreadable custom integration status.",
        );
      const state = target.state;
      if (typeof state === "object" && state !== null && "status" in state) {
        if (state.status === "pending") return { state: { status: "pending" } };
        if (
          state.status === "active" &&
          "toolCount" in state &&
          typeof state.toolCount === "number"
        )
          return { state: { status: "active", toolCount: state.toolCount } };
        if (
          state.status === "error" &&
          "message" in state &&
          typeof state.message === "string"
        )
          return { state: { status: "error", message: state.message } };
      }
      throw new Error(
        "Houston returned an unreadable custom integration status.",
      );
    },
  });
}
