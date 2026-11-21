import { defineTool } from "@earendil-works/pi-coding-agent";
import { toCanonicalProviderId } from "@houston/domain/provider-dialect";
import { isHiddenProviderId } from "@houston/domain/provider-visibility";
import { Type } from "typebox";
import { isPiProvider } from "../../ai/pi-catalog";
import { isProvider } from "../../ai/providers";
import { recordProviderConnection } from "../interaction";
import { assertNotPlanMode } from "../live-mode-gate";

export const REQUEST_PROVIDER_CONNECTION_TOOL_NAME =
  "request_provider_connection";

export function makeRequestProviderConnectionTool() {
  return defineTool({
    name: REQUEST_PROVIDER_CONNECTION_TOOL_NAME,
    label: "Connect an AI provider securely",
    description:
      "Ask the user to connect an AI provider through a secure connection card. Use the provider id from the provider catalog, including providers not connected yet. The card handles browser sign-in or secure key entry, and you automatically get a message when the provider is connected. Never request keys, passwords, or sign-in codes in chat. Queue the card, finish independent work, then end your turn.",
    parameters: Type.Object({
      provider: Type.String(),
      reason: Type.Optional(Type.String()),
    }),
    executionMode: "sequential",
    async execute(_id: string, params: { provider: string; reason?: string }) {
      assertNotPlanMode("request a provider connection");
      const provider = params.provider.trim().toLowerCase();
      if (!isProvider(toCanonicalProviderId(provider)))
        throw new Error(
          "Unknown AI provider. Read the provider catalog and use its exact provider id.",
        );
      if (isHiddenProviderId(provider, isPiProvider))
        throw new Error(
          `'${provider}' cannot be connected here. Read the provider catalog and use one of the provider ids it lists.`,
        );
      const reason = params.reason?.trim();
      recordProviderConnection({ provider, ...(reason ? { reason } : {}) });
      return {
        content: [
          {
            type: "text" as const,
            text: "A secure provider connection card was queued. End your turn after any independent work. You automatically get a message when the provider is connected; never ask for credentials in chat.",
          },
        ],
        details: { provider },
      };
    },
  });
}
