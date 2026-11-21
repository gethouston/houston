const OP_ROUTE =
  /^(activities|routines|routine_runs|learnings|config)(\/[^/]+)?$|^agentfile\/(?!\.houston\/runtime\/).+$|^skills(\/[^/]+)?$|^files(\/.+)?$|^attachments$|^skills-manifest$|^portable\/(preview|export)$|^migration\/(export|import|complete|status)$|^integrations\/custom\/(detect|definitions|definitions\/[^/]+|definitions\/[^/]+\/(credential|tools))$/;

const READ_ROUTE =
  /^(routines|routine_runs|learnings|config|skills)$|^files(\/.+)?$|^agentfile\/|^skills\/[^/]+$|^skills-manifest$|^portable\/preview$|^migration\/status$|^integrations\/custom\/definitions$|^integrations\/custom\/definitions\/[^/]+\/tools$/;

const RUN_CANCEL_ROUTE = /^routines\/[^/]+\/runs\/[^/]+\/cancel$/;

export function isOpRoute(decodedRest: string): boolean {
  return OP_ROUTE.test(decodedRest) || RUN_CANCEL_ROUTE.test(decodedRest);
}

export function isReadOpRoute(decodedRest: string): boolean {
  return READ_ROUTE.test(decodedRest);
}

export function isBinaryBodyOpRoute(decodedRest: string): boolean {
  return decodedRest === "migration/import";
}

export function isCustomIntegrationOpRoute(decodedRest: string): boolean {
  return decodedRest.startsWith("integrations/custom/");
}
