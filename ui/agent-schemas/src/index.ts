import activity from "./activity.schema.json";
import routines from "./routines.schema.json";
import routine_runs from "./routine_runs.schema.json";
import config from "./config.schema.json";
import learnings from "./learnings.schema.json";
import tracker_connection from "./tracker_connection.schema.json";
import tracker_initiative from "./tracker_initiative.schema.json";
import tracker_project from "./tracker_project.schema.json";
import tracker_cycle from "./tracker_cycle.schema.json";
import tracker_issue from "./tracker_issue.schema.json";
import tracker_agent_session from "./tracker_agent_session.schema.json";

export const schemas = {
  activity,
  routines,
  routine_runs,
  config,
  learnings,
  tracker_connection,
  tracker_initiative,
  tracker_project,
  tracker_cycle,
  tracker_issue,
  tracker_agent_session,
} as const;

export {
  activity,
  routines,
  routine_runs,
  config,
  learnings,
  tracker_connection,
  tracker_initiative,
  tracker_project,
  tracker_cycle,
  tracker_issue,
  tracker_agent_session,
};

export type SchemaName = keyof typeof schemas;
