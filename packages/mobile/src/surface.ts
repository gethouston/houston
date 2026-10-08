import { applyHostModeGlobals } from "../../web/src/boot-globals";
import type { DeployEnvironment } from "../../web/src/deploy-environment";

type SurfaceGlobals = Pick<
  Window,
  | "__HOUSTON_SURFACE__"
  | "__HOUSTON_DEPLOY_ENV__"
  | "__HOUSTON_CP__"
  | "__HOUSTON_ENGINE__"
>;

/**
 * Run before importing any app module. `app/src/lib/engine.ts` resolves the
 * gateway endpoint once, when it is evaluated, and the shell reaches app code
 * (updater and boot error reporting) before the web entry publishes the same
 * endpoint. Publishing it here keeps that import order harmless.
 */
export function publishMobileSurface(
  target: SurfaceGlobals,
  surface: {
    platform: string;
    deployEnvironment: DeployEnvironment;
    controlPlaneUrl: string;
  },
): void {
  const { platform, deployEnvironment, controlPlaneUrl } = surface;
  if (platform !== "ios" && platform !== "android") {
    throw new Error(`Unsupported native mobile platform: ${platform}`);
  }
  if (!controlPlaneUrl) throw new Error("Missing mobile control plane URL");
  target.__HOUSTON_SURFACE__ = platform;
  target.__HOUSTON_DEPLOY_ENV__ = deployEnvironment;
  applyHostModeGlobals(target, { baseUrl: controlPlaneUrl, token: "" });
}
