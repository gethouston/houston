/**
 * Per-agent route dispatch for the fake host: everything under `/agents/:id/*`.
 *
 * Two contracts share this namespace (mirroring the real deployment):
 *  - control-plane host data — activities, routines, skills, agent files
 *    (packages/web/src/engine-adapter/control-plane.ts), and
 *  - the per-agent runtime proxy — providers, auth, settings, and the
 *    conversation stream (packages/runtime-client/src/client.ts), reached at
 *    `/agents/:id/conversations/:cid/*`.
 *
 * The chat turn is the interesting one: the client subscribes to the
 * conversation's SSE stream FIRST, then POSTs the message (fire-and-forget 202).
 * We register the open stream, then push a canned reply (`text` deltas → `usage`
 * → `done`) when the message lands. See translate.ts `streamTurn`.
 */

import type { ProviderId } from "@houston/runtime-client";
import { cancelChat, openChatStream, sendMessage } from "./chat";
import { json, noContent } from "./http";
import { handleWorkspaceFiles } from "./routes-files";
import * as state from "./state";

/** Canned repo skills for the Add Skills GitHub tab (list-from-repo). A dozen
 *  so the install button reads a two-digit "Install 12" the test can compare
 *  against "Install 0" after a deselect-all. */
const REPO_SKILLS = Array.from({ length: 12 }, (_, i) => ({
  id: `repo-skill-${i}`,
  name: `Repo Skill ${i + 1}`,
  description: `Canned repo skill number ${i + 1}`,
  path: `skills/repo-skill-${i}/SKILL.md`,
}));

function makeTitle(text: string): string {
  return (
    text.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ") ||
    "New chat"
  );
}

/**
 * Dispatch `/agents/:id/...`. `rest` is the path split AFTER the `agents`
 * segment, already URL-decoded. `body` is the parsed JSON body (or undefined).
 */
export function handleAgents(
  method: string,
  rest: string[],
  req: Request,
  body: Record<string, unknown> | undefined,
): Response {
  // /agents
  if (rest.length === 0) {
    if (method === "GET") return json(state.listAgents());
    if (method === "POST")
      return json(state.createAgent(String(body?.name ?? "Agent")));
    return noContent(405);
  }

  const id = rest[0];

  // /agents/:id
  if (rest.length === 1) {
    if (method === "PATCH") {
      const renamed = state.renameAgent(id, String(body?.name ?? ""));
      return renamed
        ? json(renamed)
        : json({ error: { message: "agent not found" } }, 404);
    }
    if (method === "DELETE")
      return state.deleteAgent(id) ? noContent() : json({ error: {} }, 404);
    return noContent(405);
  }

  const sub = rest[1];
  switch (sub) {
    case "activities": {
      if (rest.length === 2) {
        if (method === "GET") return json({ items: state.listActivities(id) });
        if (method === "POST")
          return json(state.createActivity(id, body ?? {}));
        return noContent(405);
      }
      const aid = rest[2];
      if (method === "PATCH") {
        const updated = state.updateActivity(id, aid, body ?? {});
        return updated ? json(updated) : json({ error: {} }, 404);
      }
      if (method === "DELETE") {
        state.deleteActivity(id, aid);
        return noContent();
      }
      return noContent(405);
    }

    case "skills": {
      // Marketplace + repo reads are agent-scoped (PR #706). Model the GitHub
      // "list skills from a repo" then "install the selected ones" flow the
      // Add Skills dialog drives, so the UI test can exercise it end to end;
      // installs land in the per-agent skills state (state-skills.ts) so the
      // installed-tile strip, the edit modal, and delete work end to end too.
      if (rest[2] === "repo" && rest[3] === "list" && method === "POST")
        return json(REPO_SKILLS);
      if (rest[2] === "repo" && rest[3] === "install" && method === "POST") {
        const picked = Array.isArray(body?.skills) ? body.skills : [];
        const names = picked.map((s) =>
          String((s as { name?: string }).name ?? "skill"),
        );
        return json(state.installSkills(id, names));
      }
      if (rest.length === 2) {
        if (method === "GET") return json({ items: state.listSkills(id) });
        if (method === "POST") {
          state.createSkill(id, (body ?? {}) as Record<string, string>);
          return noContent(201);
        }
        return noContent(405);
      }
      const slug = decodeURIComponent(rest[2] ?? "");
      if (rest.length === 3) {
        if (method === "GET") {
          const detail = state.loadSkill(id, slug);
          return detail ? json(detail) : json({ error: {} }, 404);
        }
        if (method === "PUT") {
          return state.saveSkill(id, slug, String(body?.content ?? ""))
            ? noContent()
            : json({ error: {} }, 404);
        }
        if (method === "DELETE") {
          return state.deleteSkill(id, slug)
            ? noContent()
            : json({ error: {} }, 404);
        }
      }
      return noContent(); // run etc. — accepted no-ops
    }

    case "routines": {
      if (rest.length === 2) {
        if (method === "GET") return json({ items: state.listRoutines(id) });
        if (method === "POST")
          return json(state.createRoutine(id, body ?? {}), 201);
        return noContent(405);
      }
      const rid = rest[2];
      if (rest.length === 3 && method === "PATCH") {
        const updated = state.updateRoutine(id, rid, body ?? {});
        return updated ? json(updated) : json({ error: {} }, 404);
      }
      if (rest.length === 3 && method === "DELETE") {
        state.deleteRoutine(id, rid);
        return noContent();
      }
      return noContent(); // run-now / scheduler-sync — accepted no-ops
    }

    case "routine_runs":
      if (method === "GET") return json({ items: [] });
      return noContent(); // create/update/delete/run — accepted no-ops

    case "credential":
      return noContent(); // capture / forget

    case "providers":
      return json(state.providerList(id));

    case "settings":
      return json(
        state.setSettings(id, {
          activeProvider: body?.activeProvider as ProviderId | undefined,
          model: typeof body?.model === "string" ? body.model : undefined,
          effort: typeof body?.effort === "string" ? body.effort : undefined,
        }),
      );

    case "title":
      return json({ title: makeTitle(String(body?.text ?? "")) });

    case "auth": {
      if (rest[2] === "status") return json(state.authStatusFor(id));
      const provider = rest[2] as ProviderId; // /auth/:provider/...
      const action = rest[3];
      if (action === "login" && rest[4] === "complete") {
        state.completeLogin(id, provider);
        return json({ ok: true });
      }
      if (action === "login" && rest[4] === "cancel") {
        state.cancelLogin(id, provider);
        return json({ ok: true });
      }
      if (action === "login") {
        const enterpriseDomain =
          new URL(req.url).searchParams.get("enterpriseDomain") ?? undefined;
        return json(state.startLogin(id, provider, enterpriseDomain));
      }
      if (action === "api-key") {
        state.setApiKey(id, provider);
        return json({ ok: true });
      }
      if (action === "logout") {
        state.logout(id, provider);
        return json({ ok: true });
      }
      return noContent();
    }

    case "conversations": {
      const cid = rest[2];
      const action = rest[3];
      if (action === "events") return openChatStream(req, id, cid);
      if (action === "messages") {
        if (method === "GET")
          return json({
            id: cid,
            title: "",
            messages: state.getHistory(id, cid),
          });
        if (method === "POST")
          return sendMessage(
            id,
            cid,
            String(body?.text ?? ""),
            typeof body?.nonce === "string" ? body.nonce : undefined,
          );
      }
      if (action === "cancel") {
        // `cancelled` mirrors the runtime: false = nothing was in flight, so
        // the client settles the stuck card itself (the orphan path).
        return json({ ok: true, cancelled: cancelChat(id, cid) });
      }
      if (action === "mode" && method === "POST") {
        // Live Mode-pill switch passthrough. No turn ever runs in the fake
        // host, so it always answers the benign "nothing to apply" shape.
        return json({ ok: true, applied: false });
      }
      if (action === "dismiss-interaction" && method === "POST") {
        // Runtime passthrough: append the durable stop marker to the transcript
        // AND retire the bound activity's pending interaction (mirrors the real
        // dismiss). No turn runs in the fake host, so always the success path —
        // the real host's 409-while-running never applies here.
        state.appendStoppedMessage(id, cid);
        state.clearActivityInteraction(id, cid);
        return json({ ok: true });
      }
      return noContent();
    }

    case "agentfile": {
      // Files-first store: `/agents/:id/agentfile/<relPath>`. The board reads +
      // writes `.houston/activity/activity.json` through here.
      const relPath = rest.slice(2).join("/");
      if (method === "GET")
        return json({ content: state.readAgentFile(id, relPath) });
      if (method === "PUT") {
        state.writeAgentFile(id, relPath, String(body?.content ?? ""));
        return noContent();
      }
      return noContent(405);
    }

    case "files":
      // The Files tab's workspace surface (list/upload/move/…): routes-files.ts.
      return handleWorkspaceFiles(method, id, rest, req, body);

    case "attachments": {
      // Composer attachments — faithful to the real host's `turn/attachments.ts`:
      // a 100MB request cap (413), `scopeId` accepted+ignored, and files stored
      // in the agent's visible, durable `uploads/` folder (HOU-706) with
      // colliding names disambiguated. Returns the RELATIVE `uploads/<name>`
      // paths the agent's Read tool opens.
      if (method !== "POST") return noContent(405);
      const files = (Array.isArray(body?.files) ? body.files : []) as {
        name: string;
        contentBase64: string;
      }[];
      // base64 is ~4/3 the byte size; estimate to reject oversized uploads.
      let total = 0;
      for (const f of files)
        total += Math.floor((f.contentBase64.length * 3) / 4);
      if (total > 100 * 1024 * 1024)
        return json({ error: "attachments exceed the upload size limit" }, 413);
      return json({ paths: state.importWorkspaceFiles(id, "uploads", files) });
    }

    case "portable":
      // Share-with-a-friend export inventory. An empty (but well-shaped)
      // preview is enough for the wizard to open; the default `{items: []}`
      // fallthrough made `preview.skills.map` throw, silently closing it.
      if (rest[2] === "preview" && method === "GET")
        return json({
          claudeMd: null,
          skills: [],
          routines: [],
          learnings: [],
        });
      return noContent(405);

    default:
      console.warn(
        `[fake-host] unmodeled route ${method} /agents/${id}/${rest.slice(1).join("/")}`,
      );
      return method === "GET" ? json({ items: [] }) : noContent();
  }
}
