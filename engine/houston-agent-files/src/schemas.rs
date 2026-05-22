//! Embedded JSON Schemas, sourced from `ui/agent-schemas/src/*.schema.json` at compile time.

pub const ACTIVITY: &str = include_str!("../../../ui/agent-schemas/src/activity.schema.json");
pub const ROUTINES: &str = include_str!("../../../ui/agent-schemas/src/routines.schema.json");
pub const ROUTINE_RUNS: &str =
    include_str!("../../../ui/agent-schemas/src/routine_runs.schema.json");
pub const CONFIG: &str = include_str!("../../../ui/agent-schemas/src/config.schema.json");
pub const LEARNINGS: &str = include_str!("../../../ui/agent-schemas/src/learnings.schema.json");

pub const ALL: &[(&str, &str)] = &[
    ("activity", ACTIVITY),
    ("routines", ROUTINES),
    ("routine_runs", ROUTINE_RUNS),
    ("config", CONFIG),
    ("learnings", LEARNINGS),
];
