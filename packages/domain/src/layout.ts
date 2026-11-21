import activitySchema from "@houston-ai/agent-schemas/activity.schema.json";
import configSchema from "@houston-ai/agent-schemas/config.schema.json";
import learningsSchema from "@houston-ai/agent-schemas/learnings.schema.json";
import routineRunsSchema from "@houston-ai/agent-schemas/routine_runs.schema.json";
import routinesSchema from "@houston-ai/agent-schemas/routines.schema.json";
import { jsonDoc, type TextStore } from "./store";

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

export const skillsDirKey = (root: string) => `${root}/.agents/skills`;

export const sharedSkillsDirKey = (sharedRoot: string) =>
  `${sharedRoot}/skills`;

const SCHEMAS: Record<HoustonFamily, unknown> = {
  activity: activitySchema,
  routines: routinesSchema,
  routine_runs: routineRunsSchema,
  config: configSchema,
  learnings: learningsSchema,
};

export function schemaDoc(family: HoustonFamily): string {
  return jsonDoc(SCHEMAS[family]);
}

export async function seedSchemas(
  store: TextStore,
  root: string,
): Promise<void> {
  for (const family of FAMILIES) {
    await store.writeText(schemaKey(root, family), schemaDoc(family));
  }
}
