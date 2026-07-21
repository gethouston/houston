import {
  type Learning,
  PORTABLE_FORMAT_VERSION,
  type PortableInventory,
  type PortableManifest,
  type Routine,
} from "@houston/protocol";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { normalizeRoutines } from "./routines";

/**
 * Pack / unpack a `.houstonagent` — a zip of an agent's shareable content. Pure
 * (structured data ↔ bytes); the host filters by the user's selection and does
 * the vfs I/O. The same format flows local↔cloud, so an agent shared from a
 * desktop installs in cloud and vice versa.
 *
 * Layout:
 *   manifest.json
 *   CLAUDE.md                     (optional)
 *   skills/<slug>/SKILL.md        (per included skill)
 *   routines.json                 (the included routines, as an array)
 *   learnings.json                (the included learnings, as an array)
 */

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

/** Build the `.houstonagent` bytes. Caller supplies content already filtered by selection. */
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
    // A setup chat is machine-local (its activity id means nothing on the
    // importer's side) and `created_by` is the exporter's account identity
    // (who a fired routine acts as — never valid on another account, and not
    // ours to publish), so shared routines carry neither.
    const shareable = content.routines.map(
      ({ setup_activity_id: _local, created_by: _owner, ...r }) => r,
    );
    files[ROUTINES] = strToU8(JSON.stringify(shareable, null, 2));
  }
  if (content.learnings.length)
    files[LEARNINGS] = strToU8(JSON.stringify(content.learnings, null, 2));
  return zipSync(files);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Read a `.houstonagent`. Throws on a missing/old manifest or unknown future format. */
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
    // Run imported routines through the SAME normalization the read path uses:
    // an entry the store would drop (no identity, malformed trigger, not
    // exactly one wake mechanism) must not reach the install preview only to
    // silently vanish on the first read after install. Machine/account-local
    // keys are stripped defensively too — packs from older builds carry them.
    routines: normalizeRoutines(
      parseArray<Routine>(routinesRaw),
      ROUTINES,
    ).items.map(({ setup_activity_id: _local, created_by: _owner, ...r }) => r),
    learnings: parseArray<Learning>(learningsRaw).filter(
      (l) => isRecord(l) && typeof l.id === "string",
    ),
  };
}

/** The pre-install preview of an unpacked package. */
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

/** Pull `description:` out of a SKILL.md frontmatter for the preview (best-effort). */
function skillDescription(body: string): string {
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return "";
  const line = m[1]
    ?.split(/\r?\n/)
    .find((l) => l.trim().startsWith("description:"));
  return line ? line.slice(line.indexOf(":") + 1).trim() : "";
}
