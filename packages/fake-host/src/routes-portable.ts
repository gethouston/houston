/**
 * The agent-scoped portable routes (`/agents/:id/portable/*`): the export
 * inventory the share and copy wizards read, and the `.houstonagent` package
 * they build. Backed by the SAME per-agent state the Skills, Routines and
 * Memory surfaces serve.
 *
 * The archive is packed here with fflate in the domain's own layout
 * (`packages/domain/src/portable.ts`: manifest.json, CLAUDE.md,
 * skills/<slug>/SKILL.md, routines.json, learnings.json) rather than through
 * `@houston/domain`, whose module graph reaches JSON schema imports Node's ESM
 * loader refuses without import attributes. The browser unpacks the result
 * with the REAL `unpackAgent`, so any drift here fails the copy spec loudly.
 */

import { type Learning, PORTABLE_FORMAT_VERSION } from "@houston/protocol";
import { strToU8, zipSync } from "fflate";
import { CORS, json, noContent } from "./http";
import * as state from "./state";
import { fileKey, ISO, LEARNINGS_PATH } from "./state-store";

const CLAUDE_MD = "CLAUDE.md";

/** The wire selection the web adapter posts (`portable-map.ts toWireSelection`). */
export interface WirePortableSelection {
  includeClaudeMd: boolean;
  skillSlugs: string[];
  routineIds: string[];
  learningIds: string[];
}

/** The last export's selection, for a spec to assert what the copy carried. */
let lastExportSelection: WirePortableSelection | null = null;
export function lastPortableExport(): WirePortableSelection | null {
  return lastExportSelection;
}
export function resetPortable(): void {
  lastExportSelection = null;
}

function excerpt(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

function learningsOf(agentId: string): Learning[] {
  try {
    return JSON.parse(
      state.state.files.get(fileKey(agentId, LEARNINGS_PATH)) || "[]",
    ) as Learning[];
  } catch {
    return [];
  }
}

function preview(agentId: string): Response {
  const md = state.readAgentFile(agentId, CLAUDE_MD);
  return json({
    claudeMd:
      md.trim() === ""
        ? null
        : { byteCount: Buffer.byteLength(md, "utf8"), excerpt: excerpt(md) },
    skills: state.listSkills(agentId).map((s) => ({
      slug: s.name,
      description: s.description,
      category: s.category,
      image: s.image,
      integrations: s.integrations,
      featured: s.featured,
    })),
    routines: state.listRoutines(agentId).map((r) => ({
      id: r.id,
      name: r.name,
      promptExcerpt: excerpt(r.prompt),
      schedule: r.schedule,
      enabled: r.enabled,
      integrations: r.integrations,
    })),
    learnings: learningsOf(agentId).map((l) => ({
      id: l.id,
      text: l.text,
      createdAt: l.created_at,
    })),
  });
}

function readSelection(
  body: Record<string, unknown> | undefined,
): WirePortableSelection {
  const sel = (body?.selection ?? {}) as Partial<WirePortableSelection>;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    includeClaudeMd: Boolean(sel.includeClaudeMd),
    skillSlugs: strings(sel.skillSlugs),
    routineIds: strings(sel.routineIds),
    learningIds: strings(sel.learningIds),
  };
}

function exportPackage(
  agentId: string,
  body: Record<string, unknown> | undefined,
): Response {
  const agent = state.state.agents.find((a) => a.id === agentId);
  if (!agent) return json({ error: { message: "agent not found" } }, 404);
  const sel = readSelection(body);
  lastExportSelection = sel;
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(
      JSON.stringify({
        agentName: agent.name,
        houstonVersion: "fake-host",
        createdAt: ISO,
        anonymized: false,
        formatVersion: PORTABLE_FORMAT_VERSION,
      }),
    ),
  };
  const md = state.readAgentFile(agentId, CLAUDE_MD);
  if (sel.includeClaudeMd && md.trim() !== "") files[CLAUDE_MD] = strToU8(md);
  for (const slug of sel.skillSlugs) {
    const detail = state.loadSkill(agentId, slug);
    if (detail) files[`skills/${slug}/SKILL.md`] = strToU8(detail.content);
  }
  const routines = state
    .listRoutines(agentId)
    .filter((r) => sel.routineIds.includes(r.id));
  if (routines.length)
    files["routines.json"] = strToU8(JSON.stringify(routines));
  const learnings = learningsOf(agentId).filter((l) =>
    sel.learningIds.includes(l.id),
  );
  if (learnings.length)
    files["learnings.json"] = strToU8(JSON.stringify(learnings));
  const bytes = zipSync(files);
  // Copy into a fresh ArrayBuffer-backed view: `BodyInit` rejects a view over a
  // possibly-shared buffer.
  return new Response(new Uint8Array(bytes).buffer as ArrayBuffer, {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/zip" },
  });
}

/** Dispatch `/agents/:id/portable/<action>`. */
export function handlePortableRoutes(
  method: string,
  agentId: string,
  action: string | undefined,
  body: Record<string, unknown> | undefined,
): Response {
  if (action === "preview" && method === "GET") return preview(agentId);
  if (action === "export" && method === "POST")
    return exportPackage(agentId, body);
  return noContent(405);
}
