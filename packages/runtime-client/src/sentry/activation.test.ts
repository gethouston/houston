import { describe, expect, it } from "vitest";
import {
  engineDeployment,
  resolveEngineSentryConfig,
  sendInDevEnabled,
} from "./activation";

const DSN = "https://key@o1.ingest.sentry.io/1";

describe("sendInDevEnabled", () => {
  it("accepts the same truthy set as the Rust shell", () => {
    for (const v of ["1", "true", "yes", "on", "TRUE", " On "]) {
      expect(sendInDevEnabled(v), v).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const v of [undefined, "", "0", "false", "off", "no", "2"]) {
      expect(sendInDevEnabled(v), String(v)).toBe(false);
    }
  });
});

describe("engineDeployment", () => {
  it("managed pod wins over the production NODE_ENV it also sets", () => {
    expect(
      engineDeployment({ HOUSTON_MANAGED_CLOUD: "1", NODE_ENV: "production" }),
    ).toBe("managed-cloud");
  });

  it("compiled sidecar is desktop", () => {
    expect(engineDeployment({ HOUSTON_SIDECAR_BINARY: "/x/houston" })).toBe(
      "desktop",
    );
  });

  it("production Node without pod markers is selfhost", () => {
    expect(engineDeployment({ NODE_ENV: "production" })).toBe("selfhost");
  });

  it("source runs are dev", () => {
    expect(engineDeployment({})).toBe("dev");
    expect(engineDeployment({ NODE_ENV: "test" })).toBe("dev");
  });
});

describe("resolveEngineSentryConfig", () => {
  it("stays dormant without a DSN, in every deployment", () => {
    expect(resolveEngineSentryConfig({})).toBeUndefined();
    expect(
      resolveEngineSentryConfig({ HOUSTON_MANAGED_CLOUD: "1" }),
    ).toBeUndefined();
    expect(
      resolveEngineSentryConfig({ NODE_ENV: "production" }),
    ).toBeUndefined();
  });

  it("suppresses a dev run even with a DSN (HOU-469)", () => {
    expect(resolveEngineSentryConfig({ SENTRY_DSN: DSN })).toBeUndefined();
  });

  it("dev run activates only with the SENTRY_SEND_IN_DEV opt-in", () => {
    const config = resolveEngineSentryConfig({
      SENTRY_DSN: DSN,
      SENTRY_SEND_IN_DEV: "1",
    });
    expect(config).toMatchObject({
      dsn: DSN,
      deployment: "dev",
      environment: "development",
    });
  });

  it("activates in a managed pod with production environment", () => {
    const config = resolveEngineSentryConfig({
      SENTRY_DSN: DSN,
      HOUSTON_MANAGED_CLOUD: "1",
      NODE_ENV: "production",
    });
    expect(config).toMatchObject({
      deployment: "managed-cloud",
      environment: "production",
    });
  });

  it("desktop sidecar honors the injected SENTRY_ENVIRONMENT + SENTRY_RELEASE", () => {
    const config = resolveEngineSentryConfig({
      SENTRY_DSN: DSN,
      HOUSTON_SIDECAR_BINARY: "/Applications/Houston.app/…/houston-engine",
      SENTRY_ENVIRONMENT: "production",
      SENTRY_RELEASE: "houston-app@0.5.9",
    });
    expect(config).toMatchObject({
      deployment: "desktop",
      environment: "production",
      release: "houston-app@0.5.9",
    });
  });

  it("stamps org/agent slugs as tags when the pod env carries them", () => {
    const config = resolveEngineSentryConfig({
      SENTRY_DSN: DSN,
      HOUSTON_MANAGED_CLOUD: "1",
      HOUSTON_ORG_SLUG: "acme",
      HOUSTON_AGENT_SLUG: "Workspace%2FMax",
    });
    expect(config?.tags).toEqual({
      org_slug: "acme",
      agent_slug: "Workspace%2FMax",
    });
  });

  it("tags engine_version with the release's version part", () => {
    const desktop = resolveEngineSentryConfig({
      SENTRY_DSN: DSN,
      NODE_ENV: "production",
      SENTRY_RELEASE: "houston-app@0.5.9",
    });
    expect(desktop?.tags.engine_version).toBe("0.5.9");

    const pod = resolveEngineSentryConfig({
      SENTRY_DSN: DSN,
      HOUSTON_MANAGED_CLOUD: "1",
      SENTRY_RELEASE: "engine-pod@21ad5df5c22f",
    });
    expect(pod?.tags.engine_version).toBe("21ad5df5c22f");

    const bare = resolveEngineSentryConfig({
      SENTRY_DSN: DSN,
      NODE_ENV: "production",
      SENTRY_RELEASE: "no-at-sign",
    });
    expect(bare?.tags.engine_version).toBeUndefined();
  });

  it("omits release when none is injected", () => {
    const config = resolveEngineSentryConfig({
      SENTRY_DSN: DSN,
      NODE_ENV: "production",
    });
    expect(config?.release).toBeUndefined();
    expect(config?.tags).toEqual({});
  });
});
