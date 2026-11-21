import { config } from "../config";
import { httpSandboxFetch, type SandboxFetch } from "./tools/sandbox-fetch";

export const sandboxCall: SandboxFetch | null =
  config.controlPlaneUrl && config.sandboxToken
    ? httpSandboxFetch(config.controlPlaneUrl, config.sandboxToken)
    : null;
