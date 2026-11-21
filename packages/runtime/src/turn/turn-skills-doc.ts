import { parseSkillMd, skillKey, skillsDirKey } from "@houston/domain";
import { engineAgentId } from "./op-scope";
import type {
  ActivityDocOptions,
  ActivityDocPublishResult,
} from "./turn-activity-doc";
import type { ActivityDocSource } from "./turn-activity-source";
import { publishDerived } from "./turn-doc-merge-publish";
import type { TurnFilesystem } from "./turn-filesystem";
import { readStoreText } from "./turn-store-read";

export interface SkillsView {
  items: Array<{ name: string }>;
  diagnostics: Array<{ key: string; message?: unknown }>;
}

const DIAGNOSTIC_SLUG = /\/\.agents\/skills\/([^/]+)\/SKILL\.md$/;

const diagnosticSlug = (entry: { key: string }) =>
  DIAGNOSTIC_SLUG.exec(entry.key)?.[1] ?? "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isSkillsView(value: unknown): value is SkillsView {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) => isRecord(item) && typeof item.name === "string",
    ) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.key === "string" &&
        DIAGNOSTIC_SLUG.test(entry.key),
    )
  );
}

export const viewSlugs = (view: SkillsView): Set<string> =>
  new Set([
    ...view.items.map((item) => item.name),
    ...view.diagnostics.map(diagnosticSlug),
  ]);

export function landedSkillSlugs(
  workspaceRel: string,
  keys: Iterable<string>,
): Set<string> {
  const dir = `${skillsDirKey(workspaceRel)}/`;
  const slugs = new Set<string>();
  for (const key of keys) {
    if (!key.startsWith(dir)) continue;
    const [slug, file, ...deeper] = key.slice(dir.length).split("/");
    if (slug && file === "SKILL.md" && deeper.length === 0) slugs.add(slug);
  }
  return slugs;
}

async function storeEntries(
  source: ActivityDocSource,
  filesystem: Pick<TurnFilesystem, "workspaceRel">,
  slugs: ReadonlySet<string>,
): Promise<SkillsView> {
  const fresh: SkillsView = { items: [], diagnostics: [] };
  for (const slug of slugs) {
    const content = await readStoreText(
      source,
      skillKey(filesystem.workspaceRel, slug),
    );
    if (content === null) continue;
    const parsed = parseSkillMd(slug, content);
    if ("error" in parsed)
      fresh.diagnostics.push({
        key: skillKey(engineAgentId(filesystem), slug),
        message: parsed.error,
      });
    else fresh.items.push(parsed.summary);
  }
  return fresh;
}

const bySlug =
  <T>(slugOf: (entry: T) => string) =>
  (a: T, b: T) => {
    const left = slugOf(a);
    const right = slugOf(b);
    return left < right ? -1 : left > right ? 1 : 0;
  };

function swapSlugs<T>(
  standing: T[],
  fresh: T[],
  slugs: ReadonlySet<string>,
  slugOf: (entry: T) => string,
): T[] {
  return [
    ...standing.filter((entry) => !slugs.has(slugOf(entry))),
    ...fresh,
  ].sort(bySlug(slugOf));
}

export async function publishSkillsView(input: {
  target: ActivityDocOptions;
  source: ActivityDocSource;
  filesystem: Pick<TurnFilesystem, "workspaceRel">;
  slugs: ReadonlySet<string>;
  base: () => Promise<SkillsView | undefined>;
}): Promise<ActivityDocPublishResult> {
  let base: Promise<SkillsView | undefined> | undefined;
  const derive = async (current: unknown): Promise<SkillsView> => {
    if (!isSkillsView(current)) base ??= input.base();
    const standing = isSkillsView(current) ? current : await base;
    if (!standing) throw new Error("skills view not captured");
    const fresh = await storeEntries(
      input.source,
      input.filesystem,
      input.slugs,
    );
    return {
      items: swapSlugs(
        standing.items,
        fresh.items,
        input.slugs,
        (item) => item.name,
      ),
      diagnostics: swapSlugs(
        standing.diagnostics,
        fresh.diagnostics,
        input.slugs,
        diagnosticSlug,
      ),
    };
  };
  try {
    return await publishDerived(input.target, derive);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
