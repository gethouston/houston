import activitySchema from "@houston-ai/agent-schemas/activity.schema.json";
import configSchema from "@houston-ai/agent-schemas/config.schema.json";
import learningsSchema from "@houston-ai/agent-schemas/learnings.schema.json";
import routineRunsSchema from "@houston-ai/agent-schemas/routine_runs.schema.json";
import routinesSchema from "@houston-ai/agent-schemas/routines.schema.json";
import { saveJson, type TextStore } from "./store";

/**
 * The `.houston/` layout inside an agent's workspace — ONE convention for
 * every deployment. Locally `root` is the agent's directory (via FsVfs);
 * in cloud it is the agent's object prefix + "/workspace". Each typed family
 * lives at `.houston/<family>/<family>.json` beside its seeded JSON schema.
 */
export type HoustonFamily =
  | "activity"
  | "routines"
  | "routine_runs"
  | "config"
  | "learnings";

export const FAMILIES: HoustonFamily[] = [
  "activity",
  "routines",
  "routine_runs",
  "config",
  "learnings",
];

export const docKey = (root: string, family: HoustonFamily) =>
  `${root}/.houston/${family}/${family}.json`;

export const schemaKey = (root: string, family: HoustonFamily) =>
  `${root}/.houston/${family}/${family}.schema.json`;

/** Skills live beside `.houston`, in the Agent Skills standard layout. */
export const skillsDirKey = (root: string) => `${root}/.agents/skills`;

/**
 * The Agent Store publication record for this agent — the storeAgentId, share
 * slug/url, and last-published identity. It follows the
 * `.houston/<name>/<name>.json` shape of the typed families but is DELIBERATELY
 * not one of them: it is not in `FAMILIES` (no seeded schema), it is machine-local
 * (a pointer into the account-owned listing; ownership is account-based, so it
 * holds no secrets), and it is never part of the four portable export surfaces,
 * so it never leaves the machine in a `.houstonagent`.
 */
export const storePublicationKey = (root: string) =>
  `${root}/.houston/store-publication/store-publication.json`;

const SCHEMAS: Record<HoustonFamily, unknown> = {
  activity: activitySchema,
  routines: routinesSchema,
  routine_runs: routineRunsSchema,
  config: configSchema,
  learnings: learningsSchema,
};

/**
 * Seed every family's `.schema.json` (idempotent overwrite — the schema ships
 * with the app and is not user data). Run on agent creation so agents and
 * external tools can validate what they write.
 */
export async function seedSchemas(
  store: TextStore,
  root: string,
): Promise<void> {
  for (const family of FAMILIES) {
    await saveJson(store, schemaKey(root, family), SCHEMAS[family]);
  }
}
