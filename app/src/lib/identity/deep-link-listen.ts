// The real `auth://deep-link` subscriber, adapted to the injected seam shape.
//
// Both desktop authorize drivers (the loopback+PKCE one and the GCIP-brokered
// Apple one) subscribe to the SAME Tauri event: the Rust shell re-emits the
// loopback callback and the `houston://auth-callback` OS deep link onto one
// channel. Kept in its own module so neither driver has to import the other.

import { listen } from "@tauri-apps/api/event";
import type { DeepLinkListen } from "./oauth-attempt-contract.ts";

export const listenDeepLink: DeepLinkListen = (onPayload) =>
  listen<string>("auth://deep-link", (event) => onPayload(event.payload));
