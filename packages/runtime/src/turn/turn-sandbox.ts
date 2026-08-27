import { CustomIntegrationError } from "@houston/host/src/integrations/custom/types";
import { IntegrationUpstreamError } from "@houston/host/src/integrations/types";
import { parseAddInput } from "@houston/host/src/routes/custom-integrations";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import type { SandboxFetch } from "../session/tools/sandbox-fetch";
import {
  createTurnCustomContext,
  customDefinitionsFile,
  type TurnCustomContext,
} from "./turn-custom-context";
import { mutateTurnDocument, TurnDocConflictError } from "./turn-doc-cas";
import type { TurnFilesystem } from "./turn-filesystem";
import {
  makeTurnIntegrationRoutes,
  TurnGrantExpiredError,
} from "./turn-sandbox-integrations";
import { handleTurnWriteRoute } from "./turn-sandbox-writes";
import type { TurnGrant } from "./types";

/** Dependencies captured by a single turn's sandbox routing closure. */
export interface TurnSandboxDeps {
  grant: TurnGrant;
  hostToken: string;
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  workspaceId: string;
  conversationId: string;
  actingAs?: { userId: string; name?: string };
  orgSlug: string;
  agentSlug: string;
  fetchImpl?: typeof fetch;
}

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status });

function customStatus(error: CustomIntegrationError): number {
  return error.code === "not_found"
    ? 404
    : error.code === "duplicate_slug"
      ? 409
      : 400;
}

/** Build the `/sandbox/*` facade available only for this granted turn. */
export function makeTurnSandboxFetch(deps: TurnSandboxDeps): {
  call: SandboxFetch;
  dispose: () => Promise<void>;
} {
  const fetchImpl = deps.fetchImpl ?? fetch;
  let custom: TurnCustomContext | null = null;
  const getCustom = async () => {
    custom ??= await createTurnCustomContext({
      ...deps,
      grantUrl: deps.grant.url,
      fetchImpl,
    });
    return custom;
  };
  const resetCustom = async () => {
    await custom?.dispose();
    custom = null;
  };
  const integrations = makeTurnIntegrationRoutes(deps, fetchImpl, getCustom);

  const customRoute = async (path: string, body: Record<string, unknown>) => {
    const action = path.split("/").at(-1);
    if (action === "detect") {
      if (typeof body.url !== "string" || !body.url.trim())
        return json(400, { error: "missing 'url'" });
      return json(
        200,
        await (await getCustom()).manager.detect(body.url.trim()),
      );
    }
    if (action === "status") {
      if (typeof body.slug !== "string" || !body.slug.trim())
        return json(400, { error: "missing 'slug'" });
      const slug = body.slug.trim();
      const view = (await (await getCustom()).manager.list()).find(
        (item) => item.slug === slug,
      );
      return view
        ? json(200, view)
        : json(404, {
            error: `no custom integration '${slug}'`,
            code: "not_found",
          });
    }
    if (action === "add" && body.auth === "oauth") {
      return json(503, { error: "the pod serves this one" });
    }
    const input = action === "add" ? parseAddInput(body) : null;
    if (typeof input === "string") return json(400, { error: input });
    if (
      action === "remove" &&
      (typeof body.slug !== "string" || !body.slug.trim())
    ) {
      return json(400, { error: "missing 'slug'" });
    }
    await resetCustom();
    const result = await mutateTurnDocument({
      ...deps,
      relativePath: customDefinitionsFile,
      apply: async () => {
        const context = await getCustom();
        try {
          if (action === "add" && input) {
            return context.manager.add(input);
          }
          return context.manager
            .remove((body.slug as string).trim())
            .then(() => ({ ok: true }));
        } finally {
          await resetCustom();
        }
      },
    });
    return json(200, result);
  };

  const call: SandboxFetch = async (path, init) => {
    if ((init?.method ?? "GET") !== "POST")
      return json(405, { error: "method not allowed" });
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(
        typeof init?.body === "string" ? init.body : "{}",
      );
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return json(400, { error: "invalid JSON body" });
    }
    try {
      if (/^\/sandbox\/integrations\/(search|execute)$/.test(path))
        return await integrations(path, body);
      if (
        /^\/sandbox\/integrations\/custom\/(detect|add|remove|status)$/.test(
          path,
        )
      )
        return await customRoute(path, body);
      const write = await handleTurnWriteRoute(path, body, {
        ...deps,
        fetchImpl,
      });
      return write ?? json(404, { error: "unknown sandbox route" });
    } catch (error) {
      if (error instanceof TurnGrantExpiredError)
        return json(401, {
          error: "turn grant expired",
          code: "grant_expired",
        });
      if (error instanceof IntegrationUpstreamError)
        return json(error.status, error.body);
      if (error instanceof CustomIntegrationError)
        return json(customStatus(error), {
          error: error.message,
          code: error.code,
        });
      if (error instanceof TurnDocConflictError)
        return json(409, { error: error.message, code: error.code });
      console.error(
        `[turn-sandbox] request failed (${error instanceof Error ? error.name : typeof error})`,
      );
      return json(500, { error: "sandbox request failed" });
    }
  };
  return { call, dispose: resetCustom };
}
