/**
 * The mission tools' names, kept apart from their implementation so the pieces
 * that only need to NAME a tool — the per-mode tool selection, the pin
 * resolution's error sentences — do not pull the tool bodies (and their host
 * transport) in with them.
 */
export const START_MISSION_TOOL_NAME = "start_mission";
export const LIST_MISSIONS_TOOL_NAME = "list_missions";
export const UPDATE_MISSION_STATUS_TOOL_NAME = "update_mission_status";
