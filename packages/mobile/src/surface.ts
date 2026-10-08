import type { DeployEnvironment } from "../../web/src/deploy-environment";

type SurfaceGlobals = Pick<
  Window,
  "__HOUSTON_SURFACE__" | "__HOUSTON_DEPLOY_ENV__"
>;

/** Run before importing any module that can initialize app telemetry. */
export function publishMobileSurface(
  target: SurfaceGlobals,
  platform: string,
  deployEnvironment: DeployEnvironment,
): void {
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Unsupported native mobile platform: ${platform}`);
  }
  target.__HOUSTON_SURFACE__ = platform;
  target.__HOUSTON_DEPLOY_ENV__ = deployEnvironment;
}
