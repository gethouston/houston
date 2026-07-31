import { describe, expect, it, vi } from "vitest";
import { BootTelemetry } from "./boot";
import { sendBootReport } from "./boot-report";

describe("BootTelemetry", () => {
  it("records steps and renders prometheus exposition in seconds", async () => {
    const boot = new BootTelemetry();
    boot.record("hydrate", 3200);
    boot.setHydratedObjects(42);
    const text = await boot.render();
    expect(text).toContain(
      'houston_engine_boot_step_duration_seconds{step="hydrate"} 3.2',
    );
    expect(text).toContain("houston_engine_boot_hydrated_objects 42");
  });

  it("time() records the phase duration and passes the result through", async () => {
    const boot = new BootTelemetry();
    const out = await boot.time("migrations", async () => "done");
    expect(out).toBe("done");
    expect(boot.reportPayload().steps).toEqual([
      { step: "migrations", ms: expect.any(Number) },
    ]);
  });

  it("time() records even when the phase throws", async () => {
    const boot = new BootTelemetry();
    await expect(
      boot.time("hydrate", async () => {
        throw new Error("gcs down");
      }),
    ).rejects.toThrow("gcs down");
    expect(boot.reportPayload().steps.map((s) => s.step)).toEqual(["hydrate"]);
  });

  it("reportPayload omits unset optionals and includes total after markReady", () => {
    const boot = new BootTelemetry();
    expect(boot.reportPayload()).toEqual({ steps: [] });
    boot.markReady();
    expect(boot.reportPayload().totalMs).toBeGreaterThan(0);
  });
});

describe("sendBootReport", () => {
  const report = {
    url: "https://gw.example/",
    orgSlug: "acme",
    agentSlug: "helper",
    podToken: "tok-1",
  };

  it("POSTs the payload with pod-token auth to the boot-report route", async () => {
    const boot = new BootTelemetry();
    boot.record("listen", 5);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await sendBootReport({ report, telemetry: boot, log: () => {}, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [target, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(target).toBe("https://gw.example/v1/pod/boot-report/acme/helper");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-1",
    );
    expect(JSON.parse(init.body as string).steps).toEqual([
      { step: "listen", ms: 5 },
    ]);
  });

  it("retries once on failure, then gives up loudly", async () => {
    const boot = new BootTelemetry();
    const log = vi.fn();
    const fetchImpl = vi.fn(async () => {
      throw new Error("refused");
    });
    await sendBootReport({
      report,
      telemetry: boot,
      log,
      fetchImpl,
      retryDelayMs: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      "[boot-report] giving up after retry",
      expect.any(Error),
    );
  });

  it("treats an older gateway's 404 as done (no retry)", async () => {
    const boot = new BootTelemetry();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    await sendBootReport({ report, telemetry: boot, log: () => {}, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
