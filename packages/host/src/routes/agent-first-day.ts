import type { FirstDayStartInput } from "@houston/protocol";
import { routineActorFor } from "../auth/acting";
import { channelFor, DEFAULT_PATHS, noChannel } from "./agent-authz";
import { startFirstDay } from "./agent-first-day-start";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

/** The longest locale tag or title a start accepts: both are one short label. */
const MAX_FIELD_LENGTH = 200;

type Parsed =
  | { ok: true; input: FirstDayStartInput }
  | { ok: false; error: string };

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > MAX_FIELD_LENGTH) return null;
  return value;
}

function parseStart(body: Record<string, unknown>): Parsed {
  const locale = optionalText(body.locale);
  const title = optionalText(body.title);
  if (locale === null || title === null)
    return {
      ok: false,
      error: `'locale' and 'title' are optional strings of at most ${MAX_FIELD_LENGTH} characters`,
    };
  return {
    ok: true,
    input: {
      ...(locale ? { locale } : {}),
      ...(title ? { title } : {}),
    },
  };
}

/**
 * `POST /agents/:agentId/first-day` — start the employee's first day, or hand
 * back the setup task that already started it (`agent-first-day-start.ts`).
 * Served by the host that holds the employee: behind the gateway that is the
 * agent's own pod, so the request wakes it like any per-agent write.
 */
defineRoute({
  group: "agent-first-day",
  method: "POST",
  path: "/agents/:agentId/first-day",
  phase: "agent",
  classification: "sdk",
  source: "packages/host/src/routes/agent-first-day.ts",
  async handler({
    deps,
    authz,
    actingAs,
    actingAuthor,
    userId,
    emit,
    req,
    res,
  }) {
    const parsed = parseStart(await readJson(req));
    if (!parsed.ok) return json(res, 400, { error: parsed.error });
    if (!deps.vfs)
      return json(res, 503, { error: "agent data not configured" });
    const channel = channelFor(deps, authz.workspace);
    if (!channel) return noChannel(res, authz.workspace.runtime);
    const answer = await startFirstDay(
      {
        vfs: deps.vfs,
        root: (deps.paths ?? DEFAULT_PATHS).agentRoot(
          authz.workspace,
          authz.agent,
        ),
        workspace: authz.workspace,
        agent: authz.agent,
        channel,
        author: actingAuthor ?? undefined,
        // The same acting policy a routine fire follows (auth/acting.ts).
        actingUser: routineActorFor(deps, req, userId),
        actingAs,
        emit,
      },
      parsed.input,
    );
    if (!answer.ok)
      return json(res, answer.status, {
        error: answer.error,
        code: answer.code,
      });
    json(res, answer.status, answer.result);
  },
});
