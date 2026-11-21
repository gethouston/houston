import {
  type ManagedBridgeEndpoint,
  ManagedBridgeEndpointSchema,
} from "@houston/protocol";
import { str, strings } from "./op-grammar-fields";

export type SettingsOp =
  | {
      kind: "settings";
      action: "put";
      input: { activeProvider?: string; model?: string; effort?: string };
    }
  | {
      kind: "settings";
      action: "claim";
      provider: string;
      connectedProviders: string[];
    }
  | {
      kind: "settings";
      action: "endpoint";
      input: {
        bridge?: ManagedBridgeEndpoint;
        baseUrl: string;
        model: string;
        name?: string;
        contextWindow?: number;
        reasoning?: boolean;
        shared?: boolean;
        apiKey?: string;
      };
    };

export function parseSettingsOp(raw: Record<string, unknown>): SettingsOp {
  if (raw.action === "put") {
    const input = (raw.input ?? {}) as Record<string, unknown>;
    const pick = (k: string) =>
      typeof input[k] === "string" && (input[k] as string).length <= 200
        ? { [k]: input[k] as string }
        : {};
    return {
      kind: "settings",
      action: "put",
      input: { ...pick("activeProvider"), ...pick("model"), ...pick("effort") },
    };
  }
  if (raw.action === "claim") {
    return {
      kind: "settings",
      action: "claim",
      provider: str(raw.provider, "op.provider"),
      connectedProviders: strings(raw.connectedProviders),
    };
  }
  if (raw.action === "endpoint") {
    const input = (raw.input ?? {}) as Record<string, unknown>;
    return {
      kind: "settings",
      action: "endpoint",
      input: {
        ...(input.bridge !== undefined
          ? { bridge: ManagedBridgeEndpointSchema.parse(input.bridge) }
          : {}),
        baseUrl: str(input.baseUrl, "op.input.baseUrl"),
        model: str(input.model, "op.input.model"),
        ...(typeof input.name === "string" ? { name: input.name } : {}),
        ...(typeof input.contextWindow === "number"
          ? { contextWindow: input.contextWindow }
          : {}),
        ...(typeof input.reasoning === "boolean"
          ? { reasoning: input.reasoning }
          : {}),
        ...(input.shared === true ? { shared: true } : {}),
        ...(typeof input.apiKey === "string" ? { apiKey: input.apiKey } : {}),
      },
    };
  }
  throw new Error("invalid 'op.action'");
}
