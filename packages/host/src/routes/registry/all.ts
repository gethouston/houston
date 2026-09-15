/**
 * The barrel that makes the registry complete.
 *
 * Every module that declares routes is imported here for its side effect, so
 * anything imported from HERE sees the whole registry rather than whichever
 * modules the importer happened to pull in. That is what server.ts and the SDK
 * parity gate need: they enter the chain at the top, and a group missing from
 * this list would be silently unreachable and silently unchecked. A module
 * already inside the registry (routes/agents.ts, which hosts an agent-phase
 * group's slot) imports `dispatchGroup` from registry/index.ts directly —
 * importing the barrel from a module the barrel imports would be a cycle.
 *
 * Import order is documentation, not behaviour: matching order is the group
 * order in registry/groups.ts's GROUP_PHASES, which mirrors server.ts's chain.
 */
import "../meta";
import "../catalog";
import "../credential";
import "../credential-revoked";
import "../provider-usage";
import "../integrations-sandbox";
import "../custom-integrations";
import "../custom-integrations-oauth";
import "../routines-sandbox";
import "../learnings-sandbox";
import "../missions-sandbox";
import "../skills-sandbox";
import "../assistant-sandbox";
import "../transcripts-sandbox";
import "../events-stream";
import "../pod-activity";
import "../metrics";
import "../feedback";
import "../skills-directory";
import "../shared-skills";
import "../account";
import "../account-sidebar";
import "../portable-account";
import "../portable-from-store";
import "../migration-source";
import "../agent-configs";
import "../custom-integrations-user";
import "../integrations";
import "../setup-runtime";
import "../assistant";
import "../trigger-events";
import "../routine-fires";
import "../agent-color";
import "../routine-runs";
import "../agents";
import "../missions-remote-inbound";
import "../skills-manifest";
import "../skills";
import "../skills-remote";
import "../portable-preview";
import "../portable-anonymize";
import "../portable-export";
import "../migration";
import "../portable-store";
import "../agent-approval-read";
import "../agent-data";
import "../trigger-status";
import "../agent-file";

import "../../turn/files-routes";
import "../../turn/attachments-routes";

export { dispatchGroup, listRoutes } from "./index";
