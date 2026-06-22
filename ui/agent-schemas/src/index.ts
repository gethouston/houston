import activity from "./activity.schema.json";
import config from "./config.schema.json";
import learnings from "./learnings.schema.json";
import routine_runs from "./routine_runs.schema.json";
import routines from "./routines.schema.json";

export const schemas = {
  activity,
  routines,
  routine_runs,
  config,
  learnings,
} as const;

export { activity, config, learnings, routine_runs, routines };

export type SchemaName = keyof typeof schemas;
