import {
  type Learning,
  PORTABLE_FORMAT_VERSION,
  type PortableInventory,
  type PortableManifest,
  type Routine,
} from "@houston/protocol";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  stripLearningProvenance,
  stripLocalRoutineKeys,
} from "./portable-strip";
import { normalizeRoutines } from "./routines";

export interface PortableContent {
  claudeMd?: string;
  skills: { slug: string; body: string }[];
  routines: Routine[];
  learnings: Learning[];
}

export interface PortablePackage extends PortableContent {
  manifest: PortableManifest;
}

const MANIFEST = "manifest.json";
const CLAUDE_MD = "CLAUDE.md";
const ROUTINES = "routines.json";
const LEARNINGS = "learnings.json";
const skillPath = (slug: string) => `skills/${slug}/SKILL.md`;

export function packAgent(
  content: PortableContent,
  meta: {
    agentName: string;
    description?: string;
    exporter?: string;
    houstonVersion: string;
    anonymized?: boolean;
  },
  createdAt: string,
): Uint8Array {
  const manifest: PortableManifest = {
    agentName: meta.agentName,
    description: meta.description,
    exporter: meta.exporter,
    houstonVersion: meta.houstonVersion,
    createdAt,
    anonymized: meta.anonymized ?? false,
    formatVersion: PORTABLE_FORMAT_VERSION,
  };
  const files: Record<string, Uint8Array> = {
    [MANIFEST]: strToU8(JSON.stringify(manifest, null, 2)),
  };
  if (content.claudeMd !== undefined)
    files[CLAUDE_MD] = strToU8(content.claudeMd);
  for (const s of content.skills) files[skillPath(s.slug)] = strToU8(s.body);
  if (content.routines.length) {
    const shareable = content.routines.map(stripLocalRoutineKeys);
    files[ROUTINES] = strToU8(JSON.stringify(shareable, null, 2));
  }
  if (content.learnings.length) {
    const shareable = content.learnings.map(stripLearningProvenance);
    files[LEARNINGS] = strToU8(JSON.stringify(shareable, null, 2));
  }
  return zipSync(files);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function unpackAgent(bytes: Uint8Array): PortablePackage {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (err) {
    throw new Error(
      `not a valid .houstonagent archive: ${err instanceof Error ? err.message : err}`,
    );
  }
  const manifestRaw = entries[MANIFEST];
  if (!manifestRaw) throw new Error("archive is missing manifest.json");
  const manifest = JSON.parse(strFromU8(manifestRaw)) as PortableManifest;
  if (typeof manifest.formatVersion !== "number")
    throw new Error("manifest has no formatVersion");
  if (manifest.formatVersion > PORTABLE_FORMAT_VERSION) {
    throw new Error(
      `this agent was shared from a newer Houston (format ${manifest.formatVersion}) — update to open it`,
    );
  }

  const claude = entries[CLAUDE_MD];
  const routinesRaw = entries[ROUTINES];
  const learningsRaw = entries[LEARNINGS];

  const skills: { slug: string; body: string }[] = [];
  for (const [name, bytes2] of Object.entries(entries)) {
    const m = name.match(/^skills\/([^/]+)\/SKILL\.md$/);
    if (m) skills.push({ slug: m[1] ?? "", body: strFromU8(bytes2) });
  }
  skills.sort((a, b) => a.slug.localeCompare(b.slug));

  const parseArray = <T>(raw: Uint8Array | undefined): T[] => {
    if (!raw) return [];
    const v = JSON.parse(strFromU8(raw)) as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  };

  return {
    manifest,
    ...(claude !== undefined ? { claudeMd: strFromU8(claude) } : {}),
    skills,
    routines: normalizeRoutines(
      parseArray<Routine>(routinesRaw),
      ROUTINES,
    ).items.map(stripLocalRoutineKeys),
    learnings: parseArray<Learning>(learningsRaw)
      .filter((l) => isRecord(l) && typeof l.id === "string")
      .map(stripLearningProvenance),
  };
}

export function portableInventory(pkg: PortablePackage): PortableInventory {
  return {
    hasClaudeMd: pkg.claudeMd !== undefined,
    skills: pkg.skills.map((s) => ({
      slug: s.slug,
      description: skillDescription(s.body),
    })),
    routines: pkg.routines.map((r) => ({
      id: r.id,
      name: r.name,
      ...(r.schedule ? { schedule: r.schedule } : {}),
      ...(r.trigger
        ? {
            trigger:
              r.trigger.kind === "webhook"
                ? { kind: "webhook" as const }
                : {
                    toolkit: r.trigger.toolkit,
                    trigger_slug: r.trigger.trigger_slug,
                  },
          }
        : {}),
    })),
    learnings: pkg.learnings.map((l) => ({ id: l.id, text: l.text })),
  };
}

function skillDescription(body: string): string {
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return "";
  const line = m[1]
    ?.split(/\r?\n/)
    .find((l) => l.trim().startsWith("description:"));
  return line ? line.slice(line.indexOf(":") + 1).trim() : "";
}
