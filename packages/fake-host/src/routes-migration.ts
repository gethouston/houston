/**
 * The agent-scoped migration routes (`/agents/:id/migration/export|import`),
 * the pair "Copy an agent" moves chats through. Modeled over the fake's own
 * state: the board file rides as `.houston/activity/activity.json` and each
 * conversation's history as `.houston/runtime/conversations/<key>.json`, the
 * real host's layout, so the app's path planning is exercised as is. The
 * transcript body here is the fake's history shape, not the runtime's, since
 * only this fake reads it back.
 */

import type { ChatMessage } from "@houston/runtime-client";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { CORS, json, noContent } from "./http";
import * as state from "./state";
import { ACTIVITY_PATH, fileKey } from "./state-store";

const TRANSCRIPTS = ".houston/runtime/conversations/";

interface FakeTranscript {
  id: string;
  messages: ChatMessage[];
}

function conversationKeys(agentId: string): string[] {
  return state
    .listActivities(agentId)
    .map((a) => a.session_key ?? `activity-${a.id}`);
}

function exportZip(agentId: string, paths: string[]): Response {
  const files: Record<string, Uint8Array> = {};
  for (const rel of paths) {
    if (rel === ACTIVITY_PATH) {
      const doc = state.state.files.get(fileKey(agentId, ACTIVITY_PATH));
      if (doc !== undefined) files[rel] = strToU8(doc);
      continue;
    }
    if (rel.startsWith(TRANSCRIPTS) && rel.endsWith(".json")) {
      const key = decodeURIComponent(
        rel.slice(TRANSCRIPTS.length, -".json".length),
      );
      if (!conversationKeys(agentId).includes(key)) continue;
      const transcript: FakeTranscript = {
        id: key,
        messages: state.getHistory(agentId, key),
      };
      files[rel] = strToU8(JSON.stringify(transcript));
      continue;
    }
    return json({ error: `path outside migration scope: ${rel}` }, 400);
  }
  const bytes = zipSync(files);
  return new Response(new Uint8Array(bytes).buffer as ArrayBuffer, {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/zip" },
  });
}

async function importZip(agentId: string, req: Request): Promise<Response> {
  const entries = unzipSync(new Uint8Array(await req.arrayBuffer()));
  let written = 0;
  for (const [rel, bytes] of Object.entries(entries)) {
    const text = strFromU8(bytes);
    if (rel === ACTIVITY_PATH) {
      state.state.files.set(fileKey(agentId, ACTIVITY_PATH), text);
      state.emitDomain("ActivityChanged", agentId);
      written++;
    } else if (rel.startsWith(TRANSCRIPTS)) {
      const transcript = JSON.parse(text) as FakeTranscript;
      state.seedHistory(agentId, transcript.id, transcript.messages);
      written++;
    }
  }
  return json({ written, skipped: 0, rejected: [], sessionsRebuilt: true });
}

/** Dispatch `/agents/:id/migration/<action>`. */
export function handleMigrationRoutes(
  method: string,
  agentId: string,
  action: string | undefined,
  req: Request,
  body: Record<string, unknown> | undefined,
): Response | Promise<Response> {
  if (action === "export" && method === "POST") {
    const paths = Array.isArray(body?.paths)
      ? body.paths.filter((p): p is string => typeof p === "string")
      : [];
    return exportZip(agentId, paths);
  }
  if (action === "import" && method === "POST") return importZip(agentId, req);
  return noContent(405);
}
