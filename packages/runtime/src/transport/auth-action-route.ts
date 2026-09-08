import { cancelLogin, completeLogin, logout, startLogin } from "../auth/login";
import { json, type RouteContext, readJson } from "./http-helpers";

export async function handleAuthAction(
  ctx: RouteContext,
  provider: string,
  action: string,
) {
  try {
    if (action === "login") {
      const deviceAuth = ctx.url.searchParams.get("deviceAuth") !== "false";
      const enterpriseDomain =
        ctx.url.searchParams.get("enterpriseDomain") || undefined;
      json(
        ctx.res,
        200,
        await startLogin(provider, deviceAuth, enterpriseDomain),
      );
      return;
    }
    if (action === "login/complete") {
      const { code } = await readJson(ctx.req);
      completeLogin(provider, String(code || ""));
      json(ctx.res, 200, { ok: true });
      return;
    }
    if (action === "login/cancel") {
      cancelLogin(provider);
      json(ctx.res, 200, { ok: true });
      return;
    }
    // Attribution for the runtime.log: logout is the ONLY writer that clears a
    // provider's credential — and for openai-compatible it ALSO forgets the
    // custom endpoint config (auth/login.ts). A wiped endpoint with no user
    // sign-out means some caller hit this route; this line is what names the
    // moment in the log instead of the wipe being silent.
    console.log(
      `[auth] logout requested for ${provider} (POST /auth/${provider}/logout)${
        provider === "openai-compatible"
          ? " — clearing the custom endpoint config too"
          : ""
      }`,
    );
    await logout(provider);
    json(ctx.res, 200, { ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // A typed login error (e.g. the Codex callback port is busy) carries a
    // stable `kind`; forward it so the frontend can route its actionable
    // message to the sign-in toast instead of flattening it to a generic one.
    const kind =
      e && typeof e === "object" && "kind" in e && typeof e.kind === "string"
        ? e.kind
        : undefined;
    json(ctx.res, 400, kind ? { error, kind } : { error });
  }
}
