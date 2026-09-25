/**
 * The barrel that makes the registry complete.
 *
 * Every module that declares routes is imported here for its side effect, so
 * anything imported from HERE sees the whole registry rather than whichever
 * modules the importer happened to pull in. That is what server.ts and the SDK
 * parity gate need: they enter the chain at the top, and a group missing from
 * this list would be silently unreachable and silently unchecked.
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
import "../assistant-sandbox";
import "../transcripts-sandbox";
import "../events-stream";
import "../pod-activity";
import "../metrics";
import "../feedback";
import "../shared-skills";
import "../account";
import "../account-sidebar";
import "../portable-account";
import "../migration-source";
import "../agent-configs";
import "../custom-integrations-user";
import "../integrations";
import "../setup-runtime";
import "../assistant";
import "../trigger-events";
import "../routine-fires";
import "../agent-color";
import "../agents-crud";
import "../agents-modify";
import "../agents-credentials";
import "../agents-credentials-keys";
import "../agents-provider";
import "../routine-runs";
import "../agent-first-day";
import "../agents-activity";
import "../missions-remote-inbound";
import "../skills-manifest";
import "../skills";
import "../portable-preview";
import "../portable-export";
import "../migration";
import "../agent-approval-read";
import "../agent-data";
import "../trigger-status";
import "../agent-file";

import "../../turn/files-routes";
import "../../turn/attachments-routes";

// The catch-all forward to the agent's own engine, last: every host-served
// per-agent family above is only reachable because it is declared before this.
import "../agents";

export { dispatchGroup, listRoutes } from "./dispatch";
