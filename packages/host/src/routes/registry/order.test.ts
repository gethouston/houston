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

interface Shadow {
  earlier: string;
  later: string;
  reason: string;
}

const INTENTIONAL_SHADOWS: Shadow[] = [];

const statesAReason = (entry: Shadow): boolean =>
  entry.reason.trim().length > 20;

const shadowed = (
  earlier: string,
  later: string,
  declared: Shadow[] = INTENTIONAL_SHADOWS,
): boolean =>
  declared.some(
    (entry) =>
      entry.earlier === earlier &&
      entry.later === later &&
      statesAReason(entry),
  );

interface PatternEntry {
  path: string;
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

function shadows(
  patterns: PatternEntry[],
  declared: Shadow[] = INTENTIONAL_SHADOWS,
): string[] {
  const unreachable: string[] = [];
  for (let i = 0; i < patterns.length; i++)
    for (let j = i + 1; j < patterns.length; j++) {
      const earlier = patterns[i];
      const later = patterns[j];
      if (!earlier || !later) continue;
      if (!shareAMethod(earlier.methods, later.methods)) continue;
      if (!generalises(earlier.path, later.path)) continue;
      if (shadowed(earlier.path, later.path, declared)) continue;
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
  expect(shadows([specific, proxy])).toEqual([]);
});

test("a shadow is excused only when it is declared with a stated reason", () => {
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
  const withReason: Shadow = {
    earlier: proxy.path,
    later: specific.path,
    reason: "the proxy answers activity for both, by design",
  };
  expect(shadows([proxy, specific], [withReason])).toEqual([]);
  expect(
    shadows(
      [proxy, specific],
      [{ ...withReason, later: "/agents/:agentId/x" }],
    ),
  ).toHaveLength(1);
  expect(
    shadows([proxy, specific], [{ ...withReason, reason: "n/a" }]),
  ).toHaveLength(1);
});

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

test("every group in GROUP_PHASES has a route registered into it", () => {
  const registered = registeredRoutes();
  const dead = GROUP_ORDER.filter(
    (group) => (registered.get(group)?.length ?? 0) === 0,
  ).map((group) => `${group} (${GROUP_PHASES[group]} phase)`);
  expect(dead, "groups with a chain slot but no registered route").toEqual([]);
});

test("GROUP_ORDER's phase segments are contiguous and in phase order", () => {
  expect([...PRE_AUTH_GROUPS, ...USER_GROUPS, ...AGENT_GROUPS]).toEqual(
    GROUP_ORDER,
  );
  for (const group of PRE_AUTH_GROUPS)
    expect(["public", "sandbox"]).toContain(GROUP_PHASES[group]);
  for (const group of USER_GROUPS) expect(GROUP_PHASES[group]).toBe("user");
  for (const group of AGENT_GROUPS) expect(GROUP_PHASES[group]).toBe("agent");
});

test("a shadow's reason has to be written, not gestured at", () => {
  for (const entry of INTENTIONAL_SHADOWS)
    expect(statesAReason(entry)).toBe(true);
  const pair = { earlier: "/a/*rest", later: "/a/b" };
  expect(statesAReason({ ...pair, reason: "see above" })).toBe(false);
  expect(statesAReason({ ...pair, reason: " ".repeat(40) })).toBe(false);
  expect(
    statesAReason({ ...pair, reason: "the proxy answers /a/b for both" }),
  ).toBe(true);
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
