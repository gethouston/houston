/**
 * The embeddable-bundle entry point. esbuild bundles this into a single
 * self-contained IIFE (`dist/houston-sdk.bridge.js`) exposing one global,
 * `HoustonSdkBridge`, with `create({ send }) -> { receive, dispose }` and a
 * `version` constant.
 *
 * This is the ONLY module that installs the global shims and constructs the
 * real {@link HoustonSdk} — the package's normal imports stay side-effect-free.
 * A native host loads the bundle into its JS engine, then:
 *
 *   const bridge = HoustonSdkBridge.create({ send: postToNative });
 *   // deliver inbound native messages:
 *   bridge.receive(jsonString);
 */

import { HoustonSdk } from "../sdk";
import { type Bridge, createBridge } from "./dispatcher";
import { installGlobalShims } from "./shims";
import { BRIDGE_PROTOCOL_VERSION, type SendFn } from "./wire";

installGlobalShims();

/** The bridge protocol major, matching the `ready` handshake `v`. */
export const version = BRIDGE_PROTOCOL_VERSION;

/** Options for {@link create}. */
export interface CreateOptions {
  /** Deliver one serialized outbound message to the native side. */
  send: SendFn;
}

/** Construct a bridge over a real {@link HoustonSdk}. */
export function create(options: CreateOptions): Bridge {
  return createBridge((config) => new HoustonSdk(config), options.send);
}
