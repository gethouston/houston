import { GOLDEN_PROBES } from "../routes/routes.golden-probes";

/** How the probe authenticates. The phase decides it; the variants vary it. */
export type ProbeAuth = "none" | "sandbox" | "owner" | "other";

export interface ProbeCase {
  /** The baseline key: stable across runs because it holds the PATTERN. */
  key: string;
  method: string;
  /** The pattern; testing/route-replay.ts substitutes ids before sending. */
  path: string;
  auth: ProbeAuth;
}

const EVERY_METHOD = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/** Which credential a phase's own probe presents. */
const authForPhase = (phase: string): ProbeAuth =>
  phase === "sandbox" ? "sandbox" : phase === "public" ? "none" : "owner";

/** The credentials a user- or agent-phase path is probed with, in key order. */
const LADDER: { auth: ProbeAuth; suffix: string }[] = [
  { auth: "owner", suffix: "" },
  { auth: "none", suffix: " [anon]" },
  { auth: "other", suffix: " [other]" },
];

/**
 * The paths HEAD and OPTIONS are probed on. Named, not sampled: the host
 * special-cases neither verb, and a stride would silently re-aim at different
 * paths the moment a wave adds a route — which is the one thing a baseline
 * must never do. One path per shape that could answer them differently.
 */
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

/**
 * Paths whose answer must not change when a query string rides along — one
 * proxied to the agent's runtime (the rest and the query are forwarded
 * separately) and one the registry answers itself.
 */
const QUERY_PROBES: { method: string; path: string; phase: string }[] = [
  { method: "GET", path: "/agents/:agentId/files?path=.", phase: "agent" },
  { method: "GET", path: "/agents/:agentId/activity?stale=1", phase: "agent" },
];

/**
 * Paths the matcher must refuse structurally rather than by luck: a percent
 * escape decodeURIComponent throws on, and an empty segment. Both address the
 * per-agent dispatch surface, so what they answer is behaviour, not luck.
 */
const MALFORMED_PROBES: { method: string; path: string }[] = [
  { method: "GET", path: "/agents/%E0%A4%A/activity" },
  { method: "GET", path: "/agents//activity" },
];

const split = (probe: string): { method: string; path: string } => {
  const [method, path] = probe.split(" ");
  if (!method || !path) throw new Error(`malformed probe "${probe}"`);
  return { method, path };
};

/** The credentials a path is probed with: the ladder, or its own phase alone. */
const ladderFor = (phase: string): { auth: ProbeAuth; suffix: string }[] =>
  phase === "user" || phase === "agent"
    ? LADDER
    : [{ auth: authForPhase(phase), suffix: "" }];

/**
 * The probe set: the host's declared pairs plus the derived sets that make
 * "which handler won" observable. Deterministic and de-duplicated — the
 * baseline is keyed by `key`, so two derivations that collide would silently
 * record only one.
 */
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

  // 0. The declared pairs.
  for (const { probe, phase } of GOLDEN_PROBES) {
    const { method, path } = split(probe);
    add({ key: probe, method, path, auth: authForPhase(phase) });
  }

  for (const [path, declared] of methodsByPath) {
    const phase = phaseByPath.get(path) ?? "user";
    const ladder = ladderFor(phase);
    // 1. EVERY method the path does not declare, under every credential — this
    //    is what pins the 405-vs-404-vs-proxied split per handler, and the
    //    wrong-user variant is what proves a family 405s only behind its own
    //    ownership check rather than ahead of it.
    for (const absent of EVERY_METHOD.filter((m) => !declared.has(m)))
      for (const { auth, suffix } of ladder)
        add({ key: `${absent} ${path}${suffix}`, method: absent, path, auth });
    // 2. The trailing-slash form of every declared pair. The chain does no
    //    normalisation, so each of these has a real, separate answer.
    for (const method of declared)
      add({
        key: `${method} ${path}/`,
        method,
        path: `${path}/`,
        auth: authForPhase(phase),
      });
  }

  // 3. HEAD and OPTIONS on the named paths: the host special-cases neither,
  //    and this is where that would first show.
  for (const path of VERB_PROBE_PATHS) {
    const phase = phaseByPath.get(path);
    // A named path that stopped existing would quietly stop being probed.
    if (!phase) throw new Error(`verb probe path "${path}" is not declared`);
    const auth = authForPhase(phase);
    for (const method of ["HEAD", "OPTIONS"])
      add({ key: `${method} ${path}`, method, path, auth });
  }

  // 4. The 401/403/404 ladder: every authenticated pair, unauthenticated and
  //    then as a user who does not own the agent.
  for (const { probe, phase } of GOLDEN_PROBES) {
    if (phase !== "user" && phase !== "agent") continue;
    const { method, path } = split(probe);
    add({ key: `${probe} [anon]`, method, path, auth: "none" });
    add({ key: `${probe} [other]`, method, path, auth: "other" });
  }

  // 5. A query string must not change which handler claims the path.
  for (const { method, path, phase } of QUERY_PROBES)
    for (const { auth, suffix } of ladderFor(phase))
      add({ key: `${method} ${path}${suffix}`, method, path, auth });

  // 6. Paths no pattern may claim by accident.
  for (const { method, path } of MALFORMED_PROBES)
    for (const { auth, suffix } of LADDER)
      add({ key: `${method} ${path}${suffix}`, method, path, auth });

  return [...cases.values()];
}
