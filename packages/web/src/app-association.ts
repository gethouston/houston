import type { Plugin } from "vite";

export const APP_LINK_PATHS = ["/", "/settings/plan"] as const;

export function associationAssets(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const assets: Record<string, string> = {};
  const team = env.HOUSTON_APPLE_TEAM_ID?.trim();
  const certs = env.HOUSTON_ANDROID_CERT_SHA256?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const missing = [
    ...(!team ? ["HOUSTON_APPLE_TEAM_ID"] : []),
    ...(!certs?.length ? ["HOUSTON_ANDROID_CERT_SHA256"] : []),
  ];
  if (missing.length)
    console.warn(
      `[web/app-links] association files omitted for missing ${missing.join(", ")}`,
    );
  if (team) {
    assets[".well-known/apple-app-site-association"] = JSON.stringify({
      applinks: {
        details: [
          {
            appIDs: [`${team}.ai.gethouston.app`],
            components: APP_LINK_PATHS.map((path) => ({ "/": path })),
          },
        ],
      },
    });
  }
  if (certs?.length) {
    assets[".well-known/assetlinks.json"] = JSON.stringify([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "ai.gethouston.app",
          sha256_cert_fingerprints: certs,
        },
      },
    ]);
  }
  return assets;
}

export function appAssociationPlugin(
  env: Record<string, string | undefined>,
): Plugin {
  return {
    name: "houston-app-associations",
    apply: "build",
    generateBundle() {
      for (const [fileName, source] of Object.entries(associationAssets(env))) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
}
