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

const split = (probe: string): { method: string; path: string } => {
  const [method, path] = probe.split(" ");
  if (!method || !path) throw new Error(`malformed probe "${probe}"`);
  return { method, path };
};

/**
 * The probe set: the host's declared pairs plus the four derived sets that
 * make "which handler won" observable. Deterministic and de-duplicated — the
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

  const paths = [...methodsByPath.keys()];
  for (const path of paths) {
    const phase = phaseByPath.get(path) ?? "user";
    const auth = authForPhase(phase);
    const declared = methodsByPath.get(path) ?? new Set<string>();
    // 1. A method the path does NOT declare — this is what pins the
    //    405-vs-404-vs-proxied-to-the-runtime split per handler.
    const absent = EVERY_METHOD.find((method) => !declared.has(method));
    if (absent) add({ key: `${absent} ${path}`, method: absent, path, auth });
    // 2. The trailing-slash form of every declared pair. The chain does no
    //    normalisation, so each of these has a real, separate answer.
    for (const method of declared)
      add({ key: `${method} ${path}/`, method, path: `${path}/`, auth });
  }

  // 3. HEAD and OPTIONS on an evenly spaced sample: the host special-cases
  //    neither, and this is where that would first show.
  const stride = Math.max(1, Math.floor(paths.length / 20));
  for (let i = 0; i < paths.length && i / stride < 20; i += stride) {
    const path = paths[i];
    if (!path) continue;
    const auth = authForPhase(phaseByPath.get(path) ?? "user");
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

  return [...cases.values()];
}
