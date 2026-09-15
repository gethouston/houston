import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { replayHost } from "../../testing/route-replay-host";
import { dispatchGroup, listRoutes } from "./all";
import {
  AGENT_GROUPS,
  GROUP_ORDER,
  GROUP_PHASES,
  PRE_AUTH_GROUPS,
  USER_GROUPS,
} from "./groups";
import { registeredRoutes } from "./index";
import { generalises } from "./match";
import type { HttpMethod } from "./types";

/**
 * Ordering is the chain's oldest load-bearing secret: registration order IS
 * match order, and several routes exist only because a more general pattern is
 * declared after them. This turns that implicit arrangement into a stated one.
 *
 * A route is unreachable when an EARLIER route's pattern covers every path it
 * covers for a method they share. Declaring the pair below is the way to say
 * "the earlier one is meant to answer for both" — anything undeclared is dead
 * code that a reader would take for a live route.
 */
const INTENTIONAL_SHADOWS: {
  earlier: string;
  later: string;
  reason: string;
}[] = [];

const shadowed = (earlier: string, later: string): boolean =>
  INTENTIONAL_SHADOWS.some(
    (entry) => entry.earlier === earlier && entry.later === later,
  );

/**
 * One pattern the matcher tries. This is what shadowing is decided on, NOT
 * `listRoutes()`: a proxy family publishes descriptors for the rests it
 * forwards while MATCHING `/agents/:agentId/*rest` for every method, so a
 * descriptor list cannot see the pattern that actually swallows a later route.
 */
interface PatternEntry {
  path: string;
  /** null = every method, as the registry spells "this pattern takes them all". */
  methods: HttpMethod[] | null;
  source: string;
}

function registeredPatterns(): PatternEntry[] {
  const flat: PatternEntry[] = [];
  for (const group of GROUP_ORDER)
    for (const entry of registeredRoutes().get(group) ?? [])
      for (const pattern of entry.patterns)
        flat.push({
          path: pattern.path,
          methods: pattern.methods,
          source: `${entry.descriptors[0]?.source ?? "unknown"}#${group}`,
        });
  return flat;
}

const shareAMethod = (
  a: HttpMethod[] | null,
  b: HttpMethod[] | null,
): boolean => a === null || b === null || a.some((m) => b.includes(m));

/** Every later pattern an earlier one makes unreachable, as readable pairs. */
function shadows(patterns: PatternEntry[]): string[] {
  const unreachable: string[] = [];
  for (let i = 0; i < patterns.length; i++)
    for (let j = i + 1; j < patterns.length; j++) {
      const earlier = patterns[i];
      const later = patterns[j];
      if (!earlier || !later) continue;
      if (!shareAMethod(earlier.methods, later.methods)) continue;
      if (!generalises(earlier.path, later.path)) continue;
      if (shadowed(earlier.path, later.path)) continue;
      unreachable.push(
        `${earlier.path} (${earlier.source}) swallows ${later.path} (${later.source})`,
      );
    }
  return unreachable;
}

test("no route is shadowed by an earlier, more general one", () => {
  expect(shadows(registeredPatterns())).toEqual([]);
});

test("a catch-all declared before a specific route shadows it", () => {
  const proxy: PatternEntry = {
    path: "/agents/:agentId/*rest",
    methods: null,
    source: "packages/host/src/routes/agents.ts#agent-proxy",
  };
  const specific: PatternEntry = {
    path: "/agents/:agentId/activity",
    methods: ["GET"],
    source: "packages/host/src/routes/agents-activity.ts#agent-activity",
  };
  expect(shadows([proxy, specific])).toHaveLength(1);
  // The declared order is the whole point: the same pair the other way round
  // is the arrangement the chain actually has, and it is reachable.
  expect(shadows([specific, proxy])).toEqual([]);
});

/** Captures only what the dispatcher's own refusals write. */
function recordingResponse(): { res: ServerResponse; status: () => number } {
  let status = 0;
  const res = {
    writeHead(code: number) {
      status = code;
      return res;
    },
    end() {},
  };
  return { res: res as unknown as ServerResponse, status: () => status };
}

/**
 * The golden replay sees this only where a family 405s, so it is asserted
 * directly: a group must refuse a stranger before it tells them which methods
 * an agent they cannot see accepts.
 */
test("an agent-phase family refuses a stranger before it answers its own 405", async () => {
  const host = await replayHost();
  const path = `/agents/${host.ids.agentId}/agentfile/notes.md`;
  const entry = {
    deps: host.deps,
    method: "PATCH",
    path,
    url: new URL(`http://127.0.0.1${path}`),
    req: {} as IncomingMessage,
  };
  const stranger = recordingResponse();
  await dispatchGroup("agent-file", {
    ...entry,
    userId: "bob",
    res: stranger.res,
  });
  expect(stranger.status()).toBe(403);
  const owner = recordingResponse();
  await dispatchGroup("agent-file", {
    ...entry,
    userId: "alice",
    res: owner.res,
  });
  expect(owner.status()).toBe(405);
});

test("GROUP_ORDER covers every group exactly once", () => {
  expect([...GROUP_ORDER].sort()).toEqual(Object.keys(GROUP_PHASES).sort());
  expect(new Set(GROUP_ORDER).size).toBe(GROUP_ORDER.length);
});

/**
 * server-phases.ts walks the table one SEGMENT at a time, so the segments are
 * the shape the walk depends on: each phase's groups have to be one unbroken
 * run, and the runs have to arrive in pipeline order. A group appended to the
 * table in the wrong place would otherwise be dispatched in the wrong phase —
 * with a context that has no user id, or behind an ownership check it never
 * asked for — and the loop itself could not notice.
 */
test("GROUP_ORDER's phase segments are contiguous and in phase order", () => {
  expect([...PRE_AUTH_GROUPS, ...USER_GROUPS, ...AGENT_GROUPS]).toEqual(
    GROUP_ORDER,
  );
  for (const group of PRE_AUTH_GROUPS)
    expect(["public", "sandbox"]).toContain(GROUP_PHASES[group]);
  for (const group of USER_GROUPS) expect(GROUP_PHASES[group]).toBe("user");
  for (const group of AGENT_GROUPS) expect(GROUP_PHASES[group]).toBe("agent");
});

test("every declared shadow states a reason", () => {
  for (const entry of INTENTIONAL_SHADOWS)
    expect(entry.reason.length).toBeGreaterThan(20);
});

test("a non-sdk classification always carries a written reason", () => {
  for (const route of listRoutes()) {
    if (route.classification === "sdk") {
      expect(route.reason).toBeUndefined();
      continue;
    }
    expect(route.reason?.length ?? 0).toBeGreaterThan(20);
  }
});

test("listRoutes() is pure data — every route names the module that owns it", () => {
  for (const route of listRoutes()) {
    expect(route.source).toMatch(/^packages\/host\/src\/.+\.ts$/);
    expect(GROUP_PHASES[route.group]).toBe(route.phase);
  }
});
