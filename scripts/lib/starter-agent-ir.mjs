/**
 * Pure AgentIR mapping for the release-bundled starter agents under
 * `store/agents/<id>/`. Import-safe: no CLI parsing, no network, no
 * `process.exit` — both the publish CLI (`scripts/publish-starter-agents.mjs`)
 * and its Vitest test consume these functions.
 *
 * Source of truth per agent: `houston.json` (manifest) + `CLAUDE.md`
 * (instructions) + `.agents/skills/<slug>/SKILL.md` (skills, verbatim bodies).
 * The mapping is pinned and every produced IR is validated with `agentIrSchema`
 * before it is returned, so an invalid mapping can never reach the network.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_IR_VERSION,
  agentIrSchema,
  normalizeAgentIr,
  slugify,
} from "@houston/agentstore-contract";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Absolute path to the bundled starter-agent packages. */
export const STORE_AGENTS_DIR = join(ROOT, "store/agents");

/**
 * The store category each starter agent maps to. Every `houston.json` carries
 * the legacy `business` category; the store vocabulary is finer-grained, so the
 * remap is keyed by agent id. A starter agent with no entry here is a hard error
 * (never silently defaulted) so a new package cannot ship uncategorized.
 */
export const STARTER_CATEGORY_MAP = Object.freeze({
  bookkeeping: "finance",
  legal: "other",
  marketing: "marketing",
  operations: "productivity",
  outbound: "sales",
  people: "productivity",
  sales: "sales",
  support: "customer-support",
});

/** The starter agent ids present on disk, in stable (sorted) order. */
export function listStarterAgentIds() {
  return readdirSync(STORE_AGENTS_DIR)
    .filter((id) => statSync(join(STORE_AGENTS_DIR, id)).isDirectory())
    .sort();
}

/** Read `.agents/skills/<slug>/SKILL.md` into `{ slug, body }[]`, sorted by slug. */
function readSkills(agentDir) {
  const skillsRoot = join(agentDir, ".agents/skills");
  if (!existsSync(skillsRoot)) return [];
  return readdirSync(skillsRoot)
    .filter((slug) => statSync(join(skillsRoot, slug)).isDirectory())
    .sort()
    .map((slug) => {
      const skillMd = join(skillsRoot, slug, "SKILL.md");
      if (!existsSync(skillMd)) {
        throw new Error(`starter agent skill "${slug}" is missing SKILL.md`);
      }
      return { slug, body: readFileSync(skillMd, "utf8") };
    });
}

/**
 * Build and validate the AgentIR for one starter agent id. Throws (loudly) on a
 * missing manifest, an unmapped category, a missing name, or any schema failure.
 */
export function buildStarterAgentIr(id) {
  const agentDir = join(STORE_AGENTS_DIR, id);
  const manifestPath = join(agentDir, "houston.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`starter agent "${id}" has no houston.json`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const category = STARTER_CATEGORY_MAP[id];
  if (!category) {
    throw new Error(
      `no store category mapping for starter agent "${id}" — add it to STARTER_CATEGORY_MAP`,
    );
  }

  const name = manifest.name;
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error(`starter agent "${id}" houston.json has no name`);
  }

  const identity = {
    slug: slugify(name),
    name,
    description: manifest.description,
    category,
    tags: Array.isArray(manifest.tags) ? manifest.tags : [],
    creator: { displayName: "Houston" },
  };
  if (typeof manifest.tagline === "string" && manifest.tagline.trim() !== "") {
    identity.tagline = manifest.tagline.trim();
  }

  const claudePath = join(agentDir, "CLAUDE.md");
  const instructions = existsSync(claudePath)
    ? readFileSync(claudePath, "utf8")
    : "";

  // Normalize the raw candidate through the contract's own pipeline
  // (tags slugify+cap-6, integrations uppercase+dedupe) so the starter mapping
  // can never diverge from the rules the store's ingest applies. `parse` then
  // guarantees an invalid mapping can never reach the network.
  const { ir } = normalizeAgentIr({
    irVersion: AGENT_IR_VERSION,
    identity,
    instructions,
    skills: readSkills(agentDir),
    learnings: [],
    integrations: Array.isArray(manifest.integrations)
      ? manifest.integrations
      : [],
    provenance: {
      createdVia: "houston",
      exporter: "publish-starter-agents",
      anonymized: false,
    },
  });
  return agentIrSchema.parse(ir);
}

/** Build every starter agent IR (or a given subset), as `{ id, ir }[]`. */
export function buildAllStarterAgentIrs(ids = listStarterAgentIds()) {
  return ids.map((id) => ({ id, ir: buildStarterAgentIr(id) }));
}

/**
 * Index the caller's existing store listings for the idempotent publish match,
 * keyed by `slugify(listing.name)`.
 *
 * This is deliberately NOT keyed by the gateway's finalized share slug: that
 * slug is a GLOBAL unique key, so the gateway may append a uniqueness suffix
 * (making it diverge from `slugify(name)`), and it is `null` on an agent a prior
 * partial run created but never published. Either case would make a
 * `slug`-keyed lookup miss and re-POST a duplicate. `slugify(name)` applies the
 * exact same normalization to the stored name that `ir.identity.slug` already
 * applies (`slugify(ir.identity.name)`), so the lookup matches regardless of the
 * gateway's slug derivation and regardless of publish state. Later duplicates
 * under one key win; a listing with no usable name is skipped.
 */
export function indexExistingBySlug(agents) {
  const bySlug = new Map();
  for (const agent of agents) {
    if (typeof agent?.name !== "string") continue;
    const slug = slugify(agent.name);
    if (slug) bySlug.set(slug, agent);
  }
  return bySlug;
}
