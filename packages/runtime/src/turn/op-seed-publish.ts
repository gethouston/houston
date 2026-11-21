import { MAX_UPLOAD_BYTES } from "@houston/host/src/turn/files-import";
import { LazyStoreVfs } from "@houston/host/src/vfs";
import {
  DEFAULT_EXCLUDES,
  type ObjectMetadata,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { publishIfAbsent } from "./op-doc-create";
import {
  AGENT_DOC_FAMILIES,
  type DocDeps,
  docTarget,
  type OpClaimTurn,
  publishFamilyDocs,
} from "./op-republish";
import type { SeedTree } from "./op-seed-tree";
import { computeSeedViews, type SeedViewSources } from "./op-seed-views";
import { type ActivityDocOptions, publish } from "./turn-activity-doc";
import { TURN_HYDRATE_MAX_BYTES } from "./turn-filesystem";
import {
  isSkillsView,
  publishSkillsView,
  type SkillsView,
  viewSlugs,
} from "./turn-skills-doc";

export interface SeedPublishInput {
  deps: DocDeps;
  turn: OpClaimTurn;
  store: ObjectStore;
  prefix: string;
  objects: ObjectMetadata[];
  storeRoot: string;
  tree: SeedTree;
  views: SeedViewSources;
  adopted?: boolean;
}

const PROVIDER_VIEWS = new Set(["providers", "provider_usage"]);

export async function publishSeedDocs(input: SeedPublishInput): Promise<void> {
  const target = docTarget(input.deps, input.turn);
  if (!target) return;
  const vfs = new LazyStoreVfs({
    store: input.store,
    prefix: input.prefix,
    root: input.storeRoot,
    objects: input.objects,
    manifest: new Map(),
    excludes: DEFAULT_EXCLUDES,
    maxObjectBytes: MAX_UPLOAD_BYTES,
    maxBytes: TURN_HYDRATE_MAX_BYTES,
  });
  let views: [string, unknown][] = [];
  const failures: string[] = [];
  try {
    views = await computeSeedViews(input, vfs);
  } catch (error) {
    failures.push(`views: ${String(error)}`);
  }
  const round = async () => {
    try {
      const out = await publishFamilyDocs(
        input.deps,
        input.turn,
        { store: input.store, prefix: input.prefix },
        input.tree.workspaceRel,
        AGENT_DOC_FAMILIES,
      );
      for (const [family, doc] of views) {
        const opts = { ...target, family };
        const outcome =
          family === "skills" && isSkillsView(doc)
            ? await publishSeedSkills(input, opts, doc)
            : input.adopted && PROVIDER_VIEWS.has(family)
              ? await publishIfAbsent(opts, doc)
              : await publish(opts, doc);
        if ("error" in outcome) out.push(`${family}: ${outcome.error}`);
      }
      return out;
    } catch (error) {
      return [`publish: ${String(error)}`];
    }
  };
  let lag = await round();
  if (lag.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    lag = await round();
  }
  failures.push(...lag);
  if (failures.length > 0) {
    console.error(
      `[op] seed projection failed after a durable sync: ${failures.join("; ")} prefix=${input.prefix}`,
    );
  }
}

const publishSeedSkills = (
  input: SeedPublishInput,
  target: ActivityDocOptions,
  captured: SkillsView,
) =>
  publishSkillsView({
    target,
    source: { store: input.store, prefix: input.prefix },
    filesystem: input.tree,
    slugs: viewSlugs(captured),
    base: async () => captured,
  });
