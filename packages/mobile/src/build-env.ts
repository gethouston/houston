import type { DeployEnvironment } from "../../web/src/deploy-environment";

export function mobileBuildEnv(env: Record<string, string | undefined>): {
  controlPlaneUrl: string;
  deployEnvironment: DeployEnvironment;
  updateBaseUrl: string;
  updatePublicKey: string;
  storeUrlIos: string;
  storeUrlAndroid: string;
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
  const updateBaseUrl = env.HOUSTON_MOBILE_UPDATE_BASE_URL?.trim() ?? "";
  const updatePublicKey = env.HOUSTON_MOBILE_UPDATE_PUBKEY?.trim() ?? "";
  if (updateBaseUrl) {
    let url: URL;
    try {
      url = new URL(updateBaseUrl);
    } catch {
      throw new Error("HOUSTON_MOBILE_UPDATE_BASE_URL must be an HTTPS URL");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "HOUSTON_MOBILE_UPDATE_BASE_URL must be an HTTPS URL without credentials, query, or fragment",
      );
    }
  }
  if (updateBaseUrl && updatePublicKey && deployEnvironment === "development") {
    throw new Error(
      "OTA requires HOUSTON_MOBILE_DEPLOY_ENV production or preview",
    );
  }
  return {
    controlPlaneUrl,
    deployEnvironment,
    updateBaseUrl,
    updatePublicKey,
    storeUrlIos: env.HOUSTON_MOBILE_STORE_URL_IOS?.trim() ?? "",
    storeUrlAndroid: env.HOUSTON_MOBILE_STORE_URL_ANDROID?.trim() ?? "",
  };
}
