import { listen } from "@tauri-apps/api/event";
import type { DeepLinkListen } from "./oauth-attempt-contract.ts";

export const listenDeepLink: DeepLinkListen = (onPayload) =>
  listen<string>("auth://deep-link", (event) => onPayload(event.payload));
