import activity from "./activity.schema.json";
import routines from "./routines.schema.json";
import routine_runs from "./routine_runs.schema.json";
import config from "./config.schema.json";
import learnings from "./learnings.schema.json";
import meetings from "./meetings.schema.json";

export const schemas = {
  activity,
  routines,
  routine_runs,
  config,
  learnings,
  meetings,
} as const;

export { activity, routines, routine_runs, config, learnings, meetings };

export type SchemaName = keyof typeof schemas;
