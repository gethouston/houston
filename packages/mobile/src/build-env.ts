import type { DeployEnvironment } from "../../web/src/deploy-environment";

export function mobileBuildEnv(env: Record<string, string | undefined>): {
  controlPlaneUrl: string;
  deployEnvironment: DeployEnvironment;
} {
  const controlPlaneUrl = env.VITE_CONTROL_PLANE_URL?.trim();
  if (!controlPlaneUrl) {
    throw new Error("Mobile build requires VITE_CONTROL_PLANE_URL");
  }
  if (!env.FIREBASE_API_KEY?.trim()) {
    throw new Error("Mobile build requires FIREBASE_API_KEY for sign-in");
  }
  const deployEnvironment = env.HOUSTON_MOBILE_DEPLOY_ENV || "production";
  if (
    deployEnvironment !== "production" &&
    deployEnvironment !== "preview" &&
    deployEnvironment !== "development"
  ) {
    throw new Error(`Invalid HOUSTON_MOBILE_DEPLOY_ENV: ${deployEnvironment}`);
  }
  return { controlPlaneUrl, deployEnvironment };
}
