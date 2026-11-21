import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { TurnServerDeps } from "./server-types";
import type { TurnFilesystem } from "./turn-filesystem";
import { publishTurnRunsDoc } from "./turn-runs-doc";
import type { TurnRequest } from "./types";

test("the runs doc publishes NORMALIZED items, matching the standing projector", async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), "turn-runs-doc-"));
  const runsDir = join(workspaceDir, ".houston", "routine_runs");
  await mkdir(runsDir, { recursive: true });
  await writeFile(
    join(runsDir, "routine_runs.json"),
    JSON.stringify([
      { id: "run1", routine_id: "r1", status: "surfaced" },
      { id: "broken" },
    ]),
  );

  const bodies: unknown[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") {
      return new Response(null, { status: 404 });
    }
    bodies.push(JSON.parse(String(init.body)));
    return Response.json({ revision: 1 });
  }) as typeof fetch;

  const deps = { poolStoreUrl: "https://store.example", fetchImpl };
  const turn = {
    shadow: false,
    claim: { token: "t", bootId: "b" },
    hostToken: "host-token",
    gcsPrefix: "ws/acme/helper",
    conversationId: "routine-r1",
    turnId: "turn-1",
  };
  const filesystem = { workspaceDir, workspaceRel: "acme/helper" };

  const result = await publishTurnRunsDoc(
    deps as unknown as TurnServerDeps,
    turn as unknown as TurnRequest & { turnId: string },
    filesystem as unknown as TurnFilesystem,
  );

  expect(result).toEqual({ ok: true });
  expect(bodies).toEqual([
    {
      doc: [
        {
          id: "run1",
          routine_id: "r1",
          status: "surfaced",
          session_key: "",
          started_at: "",
        },
      ],
    },
  ]);
});
