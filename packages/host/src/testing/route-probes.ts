import { GOLDEN_PROBES } from "../routes/routes.golden-probes";

export type ProbeAuth = "none" | "sandbox" | "owner" | "other";

export interface ProbeCase {
  key: string;
  method: string;
  path: string;
  auth: ProbeAuth;
}

const EVERY_METHOD = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const authForPhase = (phase: string): ProbeAuth =>
  phase === "sandbox" ? "sandbox" : phase === "public" ? "none" : "owner";

const LADDER: { auth: ProbeAuth; suffix: string }[] = [
  { auth: "owner", suffix: "" },
  { auth: "none", suffix: " [anon]" },
  { auth: "other", suffix: " [other]" },
];

const VERB_PROBE_PATHS: string[] = [
  "/health",
  "/v1/version",
  "/v1/catalog",
  "/sandbox/credential",
  "/sandbox/missions",
  "/sandbox/transcripts/conversations/:conversationId",
  "/v1/events",
  "/activity",
  "/metrics",
  "/feedback",
  "/v1/workspaces",
  "/v1/workspaces/:workspaceId/shared-skills/:slug",
  "/v1/preferences/:key",
  "/v1/integrations/:provider/connections",
  "/setup-runtime/providers",
  "/agents",
  "/agents/:agentId",
  "/agents/:agentId/activity",
  "/agents/:agentId/agentfile/:relPath",
  "/agents/:agentId/conversations/:conversationId/messages",
];

const QUERY_PROBES: { method: string; path: string; phase: string }[] = [
  { method: "GET", path: "/agents/:agentId/files?path=.", phase: "agent" },
  { method: "GET", path: "/agents/:agentId/activity?stale=1", phase: "agent" },
];

const MALFORMED_PROBES: { method: string; path: string }[] = [
  { method: "GET", path: "/agents/%E0%A4%A/activity" },
  { method: "GET", path: "/agents//activity" },
];

const split = (probe: string): { method: string; path: string } => {
  const [method, path] = probe.split(" ");
  if (!method || !path) throw new Error(`malformed probe "${probe}"`);
  return { method, path };
};

const ladderFor = (phase: string): { auth: ProbeAuth; suffix: string }[] =>
  phase === "user" || phase === "agent"
    ? LADDER
    : [{ auth: authForPhase(phase), suffix: "" }];

export function probeCases(): ProbeCase[] {
  const cases = new Map<string, ProbeCase>();
  const add = (probe: ProbeCase) => {
    if (!cases.has(probe.key)) cases.set(probe.key, probe);
  };
  const methodsByPath = new Map<string, Set<string>>();
  const phaseByPath = new Map<string, string>();
  for (const { probe, phase } of GOLDEN_PROBES) {
    const { method, path } = split(probe);
    const methods = methodsByPath.get(path);
    if (methods) methods.add(method);
    else methodsByPath.set(path, new Set([method]));
    if (!phaseByPath.has(path)) phaseByPath.set(path, phase);
  }

  for (const { probe, phase } of GOLDEN_PROBES) {
    const { method, path } = split(probe);
    add({ key: probe, method, path, auth: authForPhase(phase) });
  }

  for (const [path, declared] of methodsByPath) {
    const phase = phaseByPath.get(path) ?? "user";
    const ladder = ladderFor(phase);
    for (const absent of EVERY_METHOD.filter((m) => !declared.has(m)))
      for (const { auth, suffix } of ladder)
        add({ key: `${absent} ${path}${suffix}`, method: absent, path, auth });
    for (const method of declared)
      add({
        key: `${method} ${path}/`,
        method,
        path: `${path}/`,
        auth: authForPhase(phase),
      });
  }

  for (const path of VERB_PROBE_PATHS) {
    const phase = phaseByPath.get(path);
    if (!phase) throw new Error(`verb probe path "${path}" is not declared`);
    const auth = authForPhase(phase);
    for (const method of ["HEAD", "OPTIONS"])
      add({ key: `${method} ${path}`, method, path, auth });
  }

  for (const { probe, phase } of GOLDEN_PROBES) {
    if (phase !== "user" && phase !== "agent") continue;
    const { method, path } = split(probe);
    add({ key: `${probe} [anon]`, method, path, auth: "none" });
    add({ key: `${probe} [other]`, method, path, auth: "other" });
  }

  for (const { method, path, phase } of QUERY_PROBES)
    for (const { auth, suffix } of ladderFor(phase))
      add({ key: `${method} ${path}${suffix}`, method, path, auth });

  for (const { method, path } of MALFORMED_PROBES)
    for (const { auth, suffix } of LADDER)
      add({ key: `${method} ${path}${suffix}`, method, path, auth });

  return [...cases.values()];
}
