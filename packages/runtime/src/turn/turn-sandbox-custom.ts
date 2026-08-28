import { parseAddInput } from "@houston/host/src/routes/custom-integrations";
import type { TurnCustomContext } from "./turn-custom-context";
import { customDefinitionsFile } from "./turn-custom-context";
import { mutateTurnDocument } from "./turn-doc-cas";
import type { TurnSandboxDeps } from "./turn-sandbox";

const oauthDecline = (): Response =>
  Response.json(
    {
      error:
        "This connection uses browser sign-in. Ask the user to open this assistant in the Houston app and keep it awake while they connect the service. Do not ask for an API key.",
      code: "oauth_requires_awake_assistant",
    },
    { status: 503 },
  );

/** Build custom-integration routes over signal-scoped executor contexts. */
export function makeTurnCustomRoutes(
  deps: TurnSandboxDeps,
  getCustom: (signal?: AbortSignal | null) => Promise<TurnCustomContext>,
  resetCustom: () => Promise<void>,
  definitionsChanged: (view: unknown) => void,
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
      const result = await (await getCustom(signal)).manager.detect(
        body.url.trim(),
      );
      return result.requiresOAuth
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
    if (action === "add" && input?.auth === "oauth") return oauthDecline();
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
    definitionsChanged({
      items: await (await getCustom(signal)).manager.list(),
    });
    return Response.json(result, { status: 200 });
  };
}
