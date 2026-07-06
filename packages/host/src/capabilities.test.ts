import { describe, expect, test } from "vitest";
import {
  CLOUD_CAPABILITIES,
  LOCAL_CAPABILITIES,
  MANAGED_CLOUD_CAPABILITIES,
} from "./capabilities";

/**
 * The capability profiles are the single source of truth the host serves at
 * /v1/capabilities and the UI gates on. This pins the OpenAI-compatible (BYO
 * endpoint) flag now that it is enabled on EVERY profile (cloud accepts a public
 * HTTPS endpoint; the save route adds the public-:443 validation). The broader
 * profile parity/asymmetry contract lives in dual-profile.test.ts.
 */

describe("capability profiles: openaiCompatible", () => {
  test("is enabled on every profile (desktop, cloud, managed cloud pod)", () => {
    expect(LOCAL_CAPABILITIES.openaiCompatible).toBe(true);
    expect(CLOUD_CAPABILITIES.openaiCompatible).toBe(true);
    expect(MANAGED_CLOUD_CAPABILITIES.openaiCompatible).toBe(true);
  });

  test("cloud + managed-cloud profiles report the cloud profile tag", () => {
    expect(CLOUD_CAPABILITIES.profile).toBe("cloud");
    expect(MANAGED_CLOUD_CAPABILITIES.profile).toBe("cloud");
    expect(LOCAL_CAPABILITIES.profile).toBe("local");
  });

  test("every profile offers the same model providers", () => {
    expect(CLOUD_CAPABILITIES.providers).toEqual(LOCAL_CAPABILITIES.providers);
    expect(MANAGED_CLOUD_CAPABILITIES.providers).toEqual(
      LOCAL_CAPABILITIES.providers,
    );
  });
});
