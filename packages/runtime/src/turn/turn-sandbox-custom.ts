import { parseAddInput } from "@houston/host/src/routes/custom-integrations-input";
import type { TurnCustomContext } from "./turn-custom-context";
import { customDefinitionsFile } from "./turn-custom-context";
import { mutateTurnDocument } from "./turn-doc-cas";
import type { TurnSandboxDeps } from "./turn-sandbox";

const oauthDecline = (): Response =>
  Response.json(
    {
      code: "oauth_connect_from_integrations",
      error:
        "Do not ask for an API key or retry. Give the user this server's exact address and ask them to open Integrations, choose Add manually, pick MCP server, paste it, and sign in.",
    },
    { status: 409 },
  );

export function makeTurnCustomRoutes(
  deps: TurnSandboxDeps,
  getCustom: (signal?: AbortSignal | null) => Promise<TurnCustomContext>,
  resetCustom: () => Promise<void>,
  definitionsChanged: (manager: TurnCustomContext["manager"]) => Promise<void>,
) {
  return async (
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal | null,
  ): Promise<Response> => {
    const action = path.split("/").at(-1);
    if (action === "detect") {
      if (typeof body.url !== "string" || !body.url.trim()) {
        return Response.json({ error: "missing 'url'" }, { status: 400 });
      }
      const { manager } = await getCustom(signal);
      const result = await manager.detect(body.url.trim());
      return result.requiresOAuth && !manager.oauthSupported
        ? oauthDecline()
        : Response.json(result, { status: 200 });
    }
    if (action === "status") {
      if (typeof body.slug !== "string" || !body.slug.trim()) {
        return Response.json({ error: "missing 'slug'" }, { status: 400 });
      }
      const slug = body.slug.trim();
      const view = (await (await getCustom(signal)).manager.list()).find(
        (item) => item.slug === slug,
      );
      return view
        ? Response.json(view, { status: 200 })
        : Response.json(
            { error: `no custom integration '${slug}'`, code: "not_found" },
            { status: 404 },
          );
    }
    const input = action === "add" ? parseAddInput(body) : null;
    if (typeof input === "string") {
      return Response.json({ error: input }, { status: 400 });
    }
    if (
      action === "add" &&
      input?.auth === "oauth" &&
      !deps.customOAuthCallbackUrl
    )
      return oauthDecline();
    if (
      action === "remove" &&
      (typeof body.slug !== "string" || !body.slug.trim())
    ) {
      return Response.json({ error: "missing 'slug'" }, { status: 400 });
    }
    await resetCustom();
    const result = await mutateTurnDocument({
      ...deps,
      relativePath: customDefinitionsFile,
      apply: async () => {
        const context = await getCustom(signal);
        try {
          if (action === "add" && input) return context.manager.add(input);
          await context.manager.remove((body.slug as string).trim());
          return { ok: true };
        } finally {
          await resetCustom();
        }
      },
    });
    await definitionsChanged((await getCustom(signal)).manager);
    return Response.json(result, { status: 200 });
  };
}
