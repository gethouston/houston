import { fetchSkillMdAtPath } from "./github";

const GH_HEADERS = { "User-Agent": "houston-skills/1.0" };

/** Manifest that defines a Claude plugin-marketplace repo and lists its plugins. */
const MARKETPLACE_MANIFEST_PATH = ".claude-plugin/marketplace.json";

/** Cap on parallel plugin-root probes for one marketplace repo. */
const PLUGIN_PROBE_CAP = 24;

/**
 * Plugin-marketplace tier of the skill lookup (PRODUCT-1382): repos like
 * anthropics/knowledge-work-plugins keep every skill at
 * `<plugin>/skills/<skillId>/SKILL.md` — one directory deeper than any path
 * the guess tier tries, and invisible to the shallow scan (which only lists
 * the repo root and a root `skills/` subtree). Their defining marker,
 * `.claude-plugin/marketplace.json`, both identifies the layout AND lists each
 * plugin's root, so one raw-CDN manifest fetch plus parallel raw-CDN probes of
 * `<pluginRoot>/skills/<skillId>/SKILL.md` resolve the skill without spending
 * any rate-limited api.github.com quota. A probed directory name IS `skillId`
 * — the same trust the guess tier places in its paths — so no frontmatter
 * confirmation is needed. Returns the raw SKILL.md, or null on any miss
 * (non-marketplace repo, unparseable manifest, no plugin holds the skill).
 */
export async function probePluginMarketplace(
  fetchImpl: typeof fetch,
  source: string,
  skillId: string,
): Promise<string | null> {
  const roots = await fetchPluginRoots(fetchImpl, source);
  const probes = await Promise.allSettled(
    roots
      .slice(0, PLUGIN_PROBE_CAP)
      .map((root) =>
        fetchSkillMdAtPath(
          fetchImpl,
          source,
          `${root}/skills/${skillId}/SKILL.md`,
        ),
      ),
  );
  // Manifest order is the tie-break, mirroring the guess tier's priority order.
  for (const probe of probes) {
    if (probe.status === "fulfilled") return probe.value;
  }
  return null;
}

/** Plugin roots from the manifest (`./sales` → `sales`), deduped; [] on any miss. */
async function fetchPluginRoots(
  fetchImpl: typeof fetch,
  source: string,
): Promise<string[]> {
  const res = await fetchImpl(
    `https://raw.githubusercontent.com/${source}/HEAD/${MARKETPLACE_MANIFEST_PATH}`,
    { headers: GH_HEADERS },
  ).catch(() => null);
  if (!res?.ok) return [];
  const manifest = (await res.json().catch(() => null)) as {
    plugins?: Array<{ source?: unknown }>;
  } | null;
  if (!manifest || !Array.isArray(manifest.plugins)) return [];

  const roots = new Set<string>();
  for (const plugin of manifest.plugins) {
    // External plugins declare object sources (other repos); only in-repo
    // relative-path sources can hold this repo's skills.
    if (typeof plugin?.source !== "string") continue;
    const root = plugin.source.replace(/^\.\//, "").replace(/\/+$/, "");
    if (root && !root.startsWith(".") && !root.includes("..")) roots.add(root);
  }
  return [...roots];
}
