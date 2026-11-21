import { captureBootLanding } from "@houston/app/lib/settings-landing";
import { applyBootTheme } from "@houston/app/lib/theme-boot";
import { createRoot } from "react-dom/client";
import { applyHostModeGlobals } from "./boot-globals";
import { bootDeployEnvironment } from "./deploy-environment";
import {
  type EngineConfig,
  NEW_ENGINE_STORAGE_KEY,
  readStoredEngineConfig,
} from "./engine-config";

window.__HOUSTON_DEPLOY_ENV__ = bootDeployEnvironment(
  window.__HOUSTON_DEPLOY_ENV__,
  window.location.hostname,
);

captureBootLanding(window.location.href, (url) =>
  window.history.replaceState(window.history.state, "", url),
);

applyBootTheme();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");
const env =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const controlPlaneUrl = env.VITE_CONTROL_PLANE_URL || "";

window.__HOUSTON_DEPLOYMENT__ = controlPlaneUrl ? "managed-cloud" : "selfhost";

if (
  window.location.pathname === "/checkout/complete" ||
  window.location.pathname === "/checkout/cancel"
) {
  const complete = window.location.pathname === "/checkout/complete";
  void import("./checkout-return").then(({ CheckoutReturn }) =>
    createRoot(rootEl).render(<CheckoutReturn complete={complete} />),
  );
} else if (controlPlaneUrl && window.location.pathname.startsWith("/admin")) {
  void import("./admin/dashboard").then(({ AdminDashboard }) =>
    createRoot(rootEl).render(
      <AdminDashboard controlPlaneUrl={controlPlaneUrl} />,
    ),
  );
} else if (controlPlaneUrl) {
  applyHostModeGlobals(window, { baseUrl: controlPlaneUrl, token: "" });
  void import("./cloud-login").then(({ CloudApp }) =>
    createRoot(rootEl).render(<CloudApp controlPlaneUrl={controlPlaneUrl} />),
  );
} else {
  const stored = readStoredEngineConfig(NEW_ENGINE_STORAGE_KEY);
  const initial: EngineConfig | null =
    stored ??
    (env.VITE_NEW_ENGINE_URL
      ? {
          baseUrl: env.VITE_NEW_ENGINE_URL,
          token: env.VITE_NEW_ENGINE_TOKEN ?? "",
        }
      : null);
  applyHostModeGlobals(window, initial);
  void import("./new-engine/root").then(({ NewEngineRoot }) =>
    createRoot(rootEl).render(<NewEngineRoot initialConfig={initial} />),
  );
}
