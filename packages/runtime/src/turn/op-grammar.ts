import {
  isBinaryBodyOpRoute,
  isOpRoute,
  isReadOpRoute,
} from "./op-route-allowlist";

/**
 * The op grammar: every operation shape a pool worker will run for a
 * sleeping agent, and the strict parser that admits it (parse-op-request.ts
 * owns the surrounding claim/credential envelope). `route` ops run the
 * host's own route handlers against the hydrated workspace; the other kinds
 * are the runtime's own.
 */
export type AgentOp =
  | {
      kind: "route";
      method: string;
      rest: string;
      /** Raw query string without the `?` (files routes take `?path=`). */
      query?: string;
      body?: string;
      /** Binary request body (a migration zip), base64 — a JSON envelope
       *  cannot carry raw bytes. Mutually exclusive with `body`. */
      bodyBase64?: string;
      contentType?: string;
    }
  | { kind: "title"; text: string }
  | {
      kind: "anonymize";
      /** Fully defaulted by the parser — one normalization layer, here. */
      input: {
        claudeMd: boolean;
        skillSlugs: string[];
        routineIds: string[];
        learningIds: string[];
        useAi: boolean;
      };
    }
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
        baseUrl: string;
        model: string;
        name?: string;
        contextWindow?: number;
        reasoning?: boolean;
        shared?: boolean;
        apiKey?: string;
      };
    }
  | {
      kind: "credential";
      action: "api-key";
      provider: string;
      apiKey: string;
      /** Azure OpenAI's per-resource endpoint, arriving with the key. */
      endpoint?: string;
    }
  | {
      kind: "conversation";
      action: "rename" | "delete";
      conversationId: string;
      title?: string;
    };

export const ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;

export function str(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`invalid '${field}'`);
  return v;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];

export function parseAgentOp(raw: Record<string, unknown>): AgentOp {
  switch (raw.kind) {
    case "route":
      return parseRouteOp(raw);
    case "title":
      return { kind: "title", text: str(raw.text, "op.text") };
    case "anonymize": {
      const input = (raw.input ?? {}) as Record<string, unknown>;
      return {
        kind: "anonymize",
        input: {
          claudeMd: input.claudeMd === true,
          skillSlugs: strings(input.skillSlugs),
          routineIds: strings(input.routineIds),
          learningIds: strings(input.learningIds),
          // Mirrors the pod route: absent means the AI pass is wanted.
          useAi: input.useAi !== false,
        },
      };
    }
    case "settings":
      return parseSettingsOp(raw);
    case "credential": {
      if (raw.action !== "api-key") throw new Error("invalid 'op.action'");
      return {
        kind: "credential",
        action: "api-key",
        provider: str(raw.provider, "op.provider"),
        apiKey: str(raw.apiKey, "op.apiKey"),
        ...(typeof raw.endpoint === "string" && raw.endpoint
          ? { endpoint: raw.endpoint }
          : {}),
      };
    }
    case "conversation": {
      const action = raw.action;
      if (action !== "rename" && action !== "delete")
        throw new Error("invalid 'op.action'");
      const conversationId = str(raw.conversationId, "op.conversationId");
      if (!ID.test(conversationId))
        throw new Error("invalid 'op.conversationId'");
      if (action === "rename" && typeof raw.title !== "string")
        throw new Error("rename needs 'op.title'");
      return {
        kind: "conversation",
        action,
        conversationId,
        ...(typeof raw.title === "string" ? { title: raw.title } : {}),
      };
    }
    default:
      throw new Error("invalid 'op.kind'");
  }
}

function parseRouteOp(raw: Record<string, unknown>): AgentOp {
  const method = str(raw.method, "op.method").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new Error("op.method is not an HTTP method");
  }
  const rest = str(raw.rest, "op.rest");
  if (rest.includes("..") || rest.startsWith("/"))
    throw new Error("invalid 'op.rest'");
  // Defense in depth: the worker accepts only the op-route shapes the
  // gateway classifier dispatches — a valid-token caller cannot reach a
  // handler surface (e.g. POST agentfile) the public path never exposes.
  // Match the DECODED path: the handlers decode, so the allowlist must
  // see what they see (`%2Ehouston` is `.houston`).
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    throw new Error("invalid 'op.rest'");
  }
  if (decoded.includes("..") || decoded.startsWith("/")) {
    throw new Error("invalid 'op.rest'");
  }
  if (!isOpRoute(decoded)) {
    throw new Error("op.rest is not an op route");
  }
  // Reads run as ops only where the gateway has no doc to serve them
  // from: the Files tab and arbitrary agent files.
  if (method === "GET" && !isReadOpRoute(decoded)) {
    throw new Error("op.rest is not a read op route");
  }
  if (typeof raw.bodyBase64 === "string" && !isBinaryBodyOpRoute(decoded)) {
    throw new Error("op.bodyBase64 is not accepted for this route");
  }
  // And the converse: a binary route must never smuggle its payload as a
  // text body — a zip in a UTF-8 string is corrupt AND would bypass the
  // runtime-transcript decline that keys off bodyBase64 (op-route.ts).
  if (
    isBinaryBodyOpRoute(decoded) &&
    typeof raw.body === "string" &&
    raw.body.length > 0
  ) {
    throw new Error("this route's body rides 'op.bodyBase64'");
  }
  const query =
    typeof raw.query === "string" && raw.query.length <= 4096
      ? raw.query.replace(/^\?/, "")
      : undefined;
  return {
    kind: "route",
    method,
    rest,
    ...(query ? { query } : {}),
    ...(typeof raw.body === "string" ? { body: raw.body } : {}),
    ...(typeof raw.bodyBase64 === "string"
      ? { bodyBase64: raw.bodyBase64 }
      : {}),
    ...(typeof raw.contentType === "string"
      ? { contentType: raw.contentType }
      : {}),
  };
}

function parseSettingsOp(raw: Record<string, unknown>): AgentOp {
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
