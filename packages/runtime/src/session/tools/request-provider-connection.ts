import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
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
      "Ask the user to connect an AI provider through Houston's secure connection card. Use the provider id from Houston's provider catalog, including providers not connected yet. Houston handles browser sign-in or secure key entry and automatically messages you when connected. Never request keys, passwords, or sign-in codes in chat. Queue the card, finish independent work, then end your turn.",
    parameters: Type.Object({
      provider: Type.String(),
      reason: Type.Optional(Type.String()),
    }),
    executionMode: "sequential",
    async execute(_id: string, params: { provider: string; reason?: string }) {
      assertNotPlanMode("request a provider connection");
      const provider = params.provider.trim().toLowerCase();
      if (!isProvider(provider))
        throw new Error(
          "Unknown AI provider. Read Houston's provider catalog and use its exact provider id.",
        );
      const reason = params.reason?.trim();
      recordProviderConnection({ provider, ...(reason ? { reason } : {}) });
      return {
        content: [
          {
            type: "text" as const,
            text: "A secure provider connection card was queued. End your turn after any independent work. Houston automatically messages you when the provider is connected; never ask for credentials in chat.",
          },
        ],
        details: { provider },
      };
    },
  });
}
