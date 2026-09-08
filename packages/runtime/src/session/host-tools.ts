import { personalAssistant } from "./runtime-role";
import { sandboxCall } from "./sandbox-call";
import { makeCustomIntegrationTools } from "./tools/custom-integrations";
import { makeSkillDirectoryTools } from "./tools/find-skills";
import { makeIntegrationTools } from "./tools/integrations";
import { makeMissionTools } from "./tools/missions";
import { makeReadMissionTool } from "./tools/read-mission";
import { makeSaveLearningTool } from "./tools/save-learning";
import { makeSaveRoutineTool } from "./tools/save-routine";

/**
 * The tools that reach the WORLD through this runtime's own host: integrations,
 * the merge-safe writes, the mission board, the skills directory. Every one of
 * them rides the same gate — a sandbox token and a host to present it to — and
 * none holds a credential of its own: the host (or its cloud gateway) acts as
 * the user. A runtime with no host in front of it simply does without them.
 */

export const hostReachable = sandboxCall !== null;

// Integration tools (Composio, platform mode): available whenever this runtime
// can reach its host with a sandbox token (server mode — local desktop +
// standing pods). They hold no credential; they proxy to /sandbox/integrations
// and the host (or its cloud gateway) acts as the user's Composio user_id.
export const integrationTools = sandboxCall
  ? makeIntegrationTools({ call: sandboxCall })
  : [];

// Custom-integration setup tools (HOU-550): same reachability gate and trust
// posture — they proxy to /sandbox/integrations/custom/* and hold no secret.
export const customIntegrationTools = sandboxCall
  ? makeCustomIntegrationTools({ call: sandboxCall })
  : [];

// The merge-safe scheduled-task write tool: proxies to /sandbox/routines/save so
// the agent never overwrites routines.json wholesale. Same reachability gate as
// the integration tools, but NOT tied to a Composio key — scheduled tasks exist
// on every deployment.
export const saveRoutineTool = sandboxCall
  ? makeSaveRoutineTool({ call: sandboxCall })
  : null;

// The merge-safe memory write tool: proxies to /sandbox/learnings/save so the
// agent never rewrites learnings.json wholesale AND the host can stamp the
// learning's provenance (who taught it, which mission it came from) from the
// turn's acting identity + conversation id. Same reachability gate as above.
export const saveLearningTool = sandboxCall
  ? makeSaveLearningTool({ call: sandboxCall })
  : null;

// The mission-board tools (PRODUCT-1244): start_mission / list_missions /
// update_mission_status proxy to /sandbox/missions/* with the same trust
// posture as save_routine; read_mission reads this runtime's own transcript
// store in-process, and goes through the host only for a mission that runs on
// ANOTHER agent. All four ride the host-reachability gate together.
export const missionTools = sandboxCall
  ? [
      ...makeMissionTools({ call: sandboxCall, personalAssistant }),
      makeReadMissionTool({ call: sandboxCall, personalAssistant }),
    ]
  : [];

// The open-skills-directory tools: proxy to /sandbox/skills/* so the agent can
// answer "is there a skill for X?" itself and add the one the user picks. Same
// reachability gate as above — the directory lives behind the host.
export const skillDirectoryTools = sandboxCall
  ? makeSkillDirectoryTools({ call: sandboxCall })
  : [];

/** The host-proxy transport the Claude backend's in-process MCP server uses. */
export const hostIntegrations = sandboxCall ? { call: sandboxCall } : undefined;
