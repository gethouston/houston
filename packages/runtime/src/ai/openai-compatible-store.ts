import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ManagedBridgeEndpoint,
  ManagedBridgeEndpointSchema,
} from "@houston/protocol";
import { config } from "../config";
export interface StoredEndpoint {
  bridge?: ManagedBridgeEndpoint;
  baseUrl?: string;
  model?: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  orgShared?: boolean;
}

export const endpointFileIn = (dataDir: string) =>
  join(dataDir, "custom-endpoint.json");

export function load(dataDir: string = config.dataDir): StoredEndpoint {
  const file = endpointFileIn(dataDir);
  if (!existsSync(file)) return {};
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as StoredEndpoint;
    if (Object.hasOwn(value, "bridge"))
      ManagedBridgeEndpointSchema.parse(value.bridge);
    return value;
  } catch (error) {
    console.error(
      "[custom-endpoint] stored endpoint could not be read",
      error instanceof Error ? error.name : "unknown",
    );
    return {};
  }
}

export function writeEndpointFileIn(dataDir: string, e: StoredEndpoint): void {
  const file = endpointFileIn(dataDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(e, null, 2));
  renameSync(tmp, file);
}

export function customEndpointConfigured(dataDir?: string): boolean {
  const e = load(dataDir);
  return !!(e.baseUrl && e.model);
}

export interface CustomEndpointStatus {
  configured: boolean;
  orgShared: boolean;
  endpoint?: OpenAiCompatibleEndpoint;
}

export function customEndpointStatus(dataDir?: string): CustomEndpointStatus {
  const endpoint = load(dataDir);
  if (!endpoint.baseUrl || !endpoint.model) {
    return { configured: false, orgShared: false };
  }
  return {
    configured: true,
    orgShared: endpoint.orgShared === true,
    endpoint: {
      ...(endpoint.bridge
        ? { bridge: ManagedBridgeEndpointSchema.parse(endpoint.bridge) }
        : {}),
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      ...(endpoint.name !== undefined ? { name: endpoint.name } : {}),
      ...(endpoint.contextWindow !== undefined
        ? { contextWindow: endpoint.contextWindow }
        : {}),
      ...(endpoint.reasoning !== undefined
        ? { reasoning: endpoint.reasoning }
        : {}),
    },
  };
}

export interface OpenAiCompatibleEndpoint {
  bridge?: ManagedBridgeEndpoint;
  baseUrl: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export interface CustomEndpointInput {
  bridge?: ManagedBridgeEndpoint;
  baseUrl: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  orgShared?: boolean;
}

export function normalizeEndpointInput(
  input: CustomEndpointInput,
): StoredEndpoint {
  const baseUrl = input.baseUrl?.trim();
  const model = input.model?.trim();
  if (!baseUrl) throw new Error("missing base URL");
  if (!model) throw new Error("missing model");
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`base URL is not a valid URL: ${baseUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("base URL must start with http:// or https://");
  if (input.bridge && url.protocol !== "https:")
    throw new Error("bridge display address must use HTTPS");
  return {
    ...(input.bridge
      ? { bridge: ManagedBridgeEndpointSchema.parse(input.bridge) }
      : {}),
    baseUrl,
    model,
    name: input.name?.trim() || undefined,
    contextWindow:
      typeof input.contextWindow === "number" && input.contextWindow > 0
        ? Math.floor(input.contextWindow)
        : undefined,
    reasoning: input.reasoning ?? undefined,
    orgShared: input.orgShared === true ? true : undefined,
  };
}
