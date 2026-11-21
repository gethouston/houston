import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { isEngineWakingError } from "../src/lib/engine-waking-error.ts";

function engineError(status: number, reason?: string): Error {
  const err = new Error(
    reason ? `${reason} (engine error ${status})` : `engine error ${status}`,
  ) as Error & { status: number };
  err.name = "HoustonEngineError";
  err.status = status;
  return err;
}

describe("isEngineWakingError", () => {
  it("matches the gateway's engine-unavailable 503", () => {
    strictEqual(
      isEngineWakingError(engineError(503, "engine unavailable")),
      true,
    );
  });

  it("never matches other 503 reasons", () => {
    strictEqual(
      isEngineWakingError(engineError(503, "setup pod unreachable")),
      false,
    );
    strictEqual(isEngineWakingError(engineError(503)), false);
  });

  it("matches the gateway's engine-proxy-failed 502 (PRODUCT-1403)", () => {
    strictEqual(
      isEngineWakingError(engineError(502, "engine proxy failed")),
      true,
    );
  });

  it("never matches other 502 reasons", () => {
    strictEqual(
      isEngineWakingError(engineError(502, "agent pod unusable")),
      false,
    );
    strictEqual(isEngineWakingError(engineError(502)), false);
  });

  it("never matches either reason on another status", () => {
    strictEqual(
      isEngineWakingError(engineError(502, "engine unavailable")),
      false,
    );
    strictEqual(
      isEngineWakingError(engineError(500, "engine unavailable")),
      false,
    );
    strictEqual(
      isEngineWakingError(engineError(503, "engine proxy failed")),
      false,
    );
    strictEqual(
      isEngineWakingError(engineError(504, "engine proxy failed")),
      false,
    );
  });

  it("requires a known error shape", () => {
    strictEqual(
      isEngineWakingError(new Error("engine unavailable (engine error 503)")),
      false,
    );
    strictEqual(
      isEngineWakingError("engine unavailable (engine error 503)"),
      false,
    );
    strictEqual(isEngineWakingError({ status: 503 }), false);
    strictEqual(isEngineWakingError(null), false);
    strictEqual(isEngineWakingError(undefined), false);
  });
});

function agentsHttpError(status: number, body: string): Error {
  const err = new Error(body) as Error & { status: number };
  err.name = "AgentsHttpError";
  err.status = status;
  return err;
}

describe("isEngineWakingError (SDK agent-write shape)", () => {
  it("matches the wake 503 body", () => {
    strictEqual(
      isEngineWakingError(
        agentsHttpError(
          503,
          '{"detail":"agent is waking","error":"engine unavailable"}',
        ),
      ),
      true,
    );
  });

  it("matches the proxy-failed 502 body", () => {
    strictEqual(
      isEngineWakingError(
        agentsHttpError(
          502,
          '{"detail":"dial tcp: connection refused","error":"engine proxy failed"}',
        ),
      ),
      true,
    );
  });

  it("matches the host's rename-latch 503 body (PRODUCT-1804)", () => {
    strictEqual(
      isEngineWakingError(
        agentsHttpError(
          503,
          '{"detail":"agent \'ws/old\' is being renamed - retry with its new id","error":"engine unavailable"}',
        ),
      ),
      true,
    );
  });

  it("matches the rename route's pod-unusable 502 body", () => {
    strictEqual(
      isEngineWakingError(
        agentsHttpError(
          502,
          '{"detail":"engine json: Patch \\"http://agent-x:4318/agents/A\\": context deadline exceeded","error":"agent pod unusable"}',
        ),
      ),
      true,
    );
  });

  it("never matches other reasons or statuses", () => {
    strictEqual(
      isEngineWakingError(
        agentsHttpError(503, '{"error":"setup pod unreachable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        agentsHttpError(503, '{"error":"agent pod unusable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        agentsHttpError(500, '{"error":"engine unavailable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(agentsHttpError(409, '{"error":"name taken"}')),
      false,
    );
  });

  it("never matches non-JSON bodies", () => {
    strictEqual(
      isEngineWakingError(agentsHttpError(503, "agents request failed: 503")),
      false,
    );
    strictEqual(
      isEngineWakingError(agentsHttpError(502, "<html>Bad Gateway</html>")),
      false,
    );
    strictEqual(isEngineWakingError(agentsHttpError(503, "{not json")), false);
  });

  it("keeps pod-unusable a real error on the legacy shape (dispatch path)", () => {
    strictEqual(
      isEngineWakingError(engineError(502, "agent pod unusable")),
      false,
    );
  });
});

function runtimeEngineError(status: number, body: string): Error {
  const err = new Error(
    `engine request failed (${status}): ${body}`,
  ) as Error & {
    status: number;
    body: string;
  };
  err.name = "EngineError";
  err.status = status;
  err.body = body;
  return err;
}

describe("isEngineWakingError (runtime-client shape)", () => {
  it("matches the setup-pod wake 503 body (PRODUCT-1612)", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(
          503,
          '{"detail":"setup pod unreachable","error":"engine unavailable"}',
        ),
      ),
      true,
    );
  });

  it("matches the agent wake 503 body", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(
          503,
          '{"detail":"agent is waking","error":"engine unavailable"}',
        ),
      ),
      true,
    );
  });

  it("matches the proxy-failed 502 body", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(
          502,
          '{"detail":"dial tcp: connection refused","error":"engine proxy failed"}',
        ),
      ),
      true,
    );
  });

  it("never matches other reasons or statuses", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(503, '{"error":"setup pod unreachable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(502, '{"error":"agent pod unusable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(500, '{"error":"engine unavailable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(runtimeEngineError(409, '{"error":"name taken"}')),
      false,
    );
  });

  it("never matches non-JSON or missing bodies", () => {
    strictEqual(
      isEngineWakingError(runtimeEngineError(503, "<html>Bad Gateway</html>")),
      false,
    );
    strictEqual(isEngineWakingError(runtimeEngineError(503, "")), false);
    const bodyless = new Error("engine request failed (503): ") as Error & {
      status: number;
    };
    bodyless.name = "EngineError";
    bodyless.status = 503;
    strictEqual(isEngineWakingError(bodyless), false);
  });
});

const STILL_STARTING =
  "the agent's runtime is still starting, try again shortly";

describe("isEngineWakingError (runtime still starting)", () => {
  it("matches on the runtime-client shape, where it was observed", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(503, `{"error":"${STILL_STARTING}"}`),
      ),
      true,
    );
  });

  it("matches on the legacy and SDK shapes too", () => {
    strictEqual(isEngineWakingError(engineError(503, STILL_STARTING)), true);
    strictEqual(
      isEngineWakingError(
        agentsHttpError(503, `{"error":"${STILL_STARTING}"}`),
      ),
      true,
    );
  });

  it("is a 503 reason only, matched exactly", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(502, `{"error":"${STILL_STARTING}"}`),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(503, '{"error":"the agent\'s runtime is starting"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(engineError(503, "the agent's runtime")),
      false,
    );
  });
});

const HOST_SHUTTING_DOWN = "the host is shutting down; retry shortly";

describe("isEngineWakingError (host shutting down)", () => {
  it("matches on the runtime-client shape, where it was observed", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(503, `{"error":"${HOST_SHUTTING_DOWN}"}`),
      ),
      true,
    );
  });

  it("matches the newer host's engine-unavailable pair with the reason as detail", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(
          503,
          `{"error":"engine unavailable","detail":"${HOST_SHUTTING_DOWN}"}`,
        ),
      ),
      true,
    );
  });

  it("matches on the legacy and SDK shapes too", () => {
    strictEqual(
      isEngineWakingError(engineError(503, HOST_SHUTTING_DOWN)),
      true,
    );
    strictEqual(
      isEngineWakingError(
        agentsHttpError(503, `{"error":"${HOST_SHUTTING_DOWN}"}`),
      ),
      true,
    );
  });

  it("is a 503 reason only, matched exactly", () => {
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(502, `{"error":"${HOST_SHUTTING_DOWN}"}`),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        runtimeEngineError(503, '{"error":"the host is shutting down"}'),
      ),
      false,
    );
  });
});

function activitiesHttpError(status: number, body: string): Error {
  const err = new Error(body) as Error & { status: number };
  err.name = "ActivitiesHttpError";
  err.status = status;
  return err;
}

const CPCLIENT_ENSURE_AWAKE_503 =
  '{"detail":"cpclient: POST /internal/v1/agents/b095cb5c018ca652/82a19c02c0bd0c5b:ensure-awake: Post \\"http://control-plane.houston-gateway.svc.cluster.local:8081/internal/v1/agents/b095cb5c018ca652/82a19c02c0bd0c5b:ensure-awake\\": context deadline exceeded","error":"engine unavailable"}';

describe("isEngineWakingError (control-plane stall body, PRODUCT-1736)", () => {
  it("classifies the cpclient deadline 503 quiet on the SDK activity shape", () => {
    strictEqual(
      isEngineWakingError(activitiesHttpError(503, CPCLIENT_ENSURE_AWAKE_503)),
      true,
    );
  });

  it("classifies the same answer quiet on the engine-adapter shape", () => {
    const err = engineError(503, "engine unavailable") as Error & {
      body: unknown;
    };
    err.body = JSON.parse(CPCLIENT_ENSURE_AWAKE_503);
    strictEqual(isEngineWakingError(err), true);
  });

  it("never lets the cpclient detail promote another reason", () => {
    strictEqual(
      isEngineWakingError(
        activitiesHttpError(
          503,
          '{"detail":"cpclient: POST /internal/v1/agents/o/a:ensure-awake: context deadline exceeded","error":"no cluster configured"}',
        ),
      ),
      false,
    );
  });
});

describe("isEngineWakingError (SDK activity-write shape)", () => {
  it("matches the proxy-failed 502 body", () => {
    strictEqual(
      isEngineWakingError(
        activitiesHttpError(
          502,
          '{"detail":"Post http://agent-x:4318/agents/A/activities: dial tcp: lookup agent-x: no such host","error":"engine proxy failed"}',
        ),
      ),
      true,
    );
  });

  it("matches the wake 503 bodies", () => {
    strictEqual(
      isEngineWakingError(
        activitiesHttpError(
          503,
          '{"detail":"agent is waking","error":"engine unavailable"}',
        ),
      ),
      true,
    );
    strictEqual(
      isEngineWakingError(
        activitiesHttpError(503, `{"error":"${STILL_STARTING}"}`),
      ),
      true,
    );
  });

  it("never matches other reasons, statuses or non-JSON bodies", () => {
    strictEqual(
      isEngineWakingError(
        activitiesHttpError(404, '{"error":"agent not found"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        activitiesHttpError(500, '{"error":"engine unavailable"}'),
      ),
      false,
    );
    strictEqual(
      isEngineWakingError(
        activitiesHttpError(503, "activities request failed: 503"),
      ),
      false,
    );
  });

  it("rejects an unknown error name carrying a waking body", () => {
    const err = new Error('{"error":"engine unavailable"}') as Error & {
      status: number;
    };
    err.name = "MissionsHttpError";
    err.status = 503;
    strictEqual(isEngineWakingError(err), false);
  });
});
