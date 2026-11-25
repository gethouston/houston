import type { AgentCtx, PublicCtx, UserCtx } from "./context";
import type { GroupId } from "./groups";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export type Classification =
  | "sdk"
  | "internal-sandbox"
  | "internal-control-plane"
  | "infra"
  | "runtime-proxy";

export type Phase = "public" | "sandbox" | "user" | "agent";

export type MethodMismatch = "fallthrough" | "405";

interface RouteCommon {
  group: GroupId;
  method: HttpMethod | HttpMethod[];
  path: string;
  source: string;
  methodMismatch?: MethodMismatch;
}

export type Classified =
  | { classification: "sdk"; reason?: undefined }
  | { classification: Exclude<Classification, "sdk">; reason: string };

// biome-ignore lint/suspicious/noConfusingVoidType: an async handler with no return is Promise<void>, which only void accepts.
export type Answer = Promise<boolean | void> | boolean | void;

export type Phased =
  | { phase: "public" | "sandbox"; handler(ctx: PublicCtx): Answer }
  | { phase: "user"; handler(ctx: UserCtx): Answer }
  | { phase: "agent"; handler(ctx: AgentCtx): Answer };

export type { GroupId } from "./groups";

export type RouteDef = RouteCommon & Classified & Phased;

// WHY: Not Omit<RouteDef>: RouteDef is a union and Omit over it erases the per-phase handler type. ADR-0016
export type RouteFamilyDef = Omit<RouteCommon, "method" | "path"> &
  Classified &
  Phased & {
    members: { method: HttpMethod; path: string }[];
    owns?: string[];
  };

export type ProxyFamilyDef = Omit<
  RouteCommon,
  "method" | "path" | "methodMismatch"
> & {
  path: "/agents/:agentId/*rest";
  phase: "agent";
  classification: "runtime-proxy";
  reason: string;
  members: { method: HttpMethod; rest: string }[];
  handler(ctx: AgentCtx): Promise<void> | void;
};

export interface RouteDescriptor {
  method: HttpMethod;
  path: string;
  classification: Classification;
  phase: Phase;
  reason?: string;
  source: string;
  group: GroupId;
}
