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

export const STORE_AGENTS_DIR = join(ROOT, "store/agents");

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

export function listStarterAgentIds() {
  return readdirSync(STORE_AGENTS_DIR)
    .filter((id) => statSync(join(STORE_AGENTS_DIR, id)).isDirectory())
    .sort();
}

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

export function buildAllStarterAgentIrs(ids = listStarterAgentIds()) {
  return ids.map((id) => ({ id, ir: buildStarterAgentIr(id) }));
}

export function indexExistingBySlug(agents) {
  const bySlug = new Map();
  for (const agent of agents) {
    if (typeof agent?.name !== "string") continue;
    const slug = slugify(agent.name);
    if (slug) bySlug.set(slug, agent);
  }
  return bySlug;
}
