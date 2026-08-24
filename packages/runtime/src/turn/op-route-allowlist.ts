/**
 * The route-op allowlists (mirrors the Go classifier): which `rest` shapes a
 * pool worker will run at all, and which of those may run as a GET. Defense
 * in depth — the gateway classifier decides what is DISPATCHED; a
 * valid-token caller must still never reach a handler surface (e.g. POST
 * agentfile) the public path never exposes.
 */

// The agent-data families, agentfile writes, skills (install + manage),
// files/attachments, portable export + Agent Store, the desktop→cloud
// migration, and custom integrations (OAuth start excepted: its pending
// state lives in the pod's memory, where the browser callback lands).
// Never a runtime path.
const OP_ROUTE =
  /^(activities|routines|routine_runs|learnings|config)(\/[^/]+)?$|^agentfile\/(?!\.houston\/runtime\/).+$|^skills(\/[^/]+)?$|^skills\/(community|repo)\/install$|^files(\/.+)?$|^attachments$|^skills-manifest$|^portable\/(preview|export|store-ir|store-publication)$|^migration\/(export|import|complete|status)$|^integrations\/custom\/(detect|definitions|definitions\/[^/]+|definitions\/[^/]+\/(credential|tools))$/;

// Reads run as ops only where the gateway has no doc to serve them from:
// the Files tab, arbitrary agent files, the export/migration inventories,
// and a custom integration's compiled tool list.
const READ_ROUTE =
  /^files(\/.+)?$|^agentfile\/|^skills-manifest$|^portable\/preview$|^portable\/store-publication$|^migration\/status$|^integrations\/custom\/definitions$|^integrations\/custom\/definitions\/[^/]+\/tools$/;

export function isOpRoute(decodedRest: string): boolean {
  return OP_ROUTE.test(decodedRest);
}

export function isReadOpRoute(decodedRest: string): boolean {
  return READ_ROUTE.test(decodedRest);
}

/** Route ops whose request body is binary (a zip), riding `bodyBase64`. */
export function isBinaryBodyOpRoute(decodedRest: string): boolean {
  return decodedRest === "migration/import";
}

/** Custom-integration route ops read/write the STORE-ROOT definitions file
 *  (`custom-integrations.json` beside `workspaces/`), not the agent tree. */
export function isCustomIntegrationOpRoute(decodedRest: string): boolean {
  return decodedRest.startsWith("integrations/custom/");
}
