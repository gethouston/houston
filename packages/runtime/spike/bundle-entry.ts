// Minimal "what the engine actually uses" entry, to measure bundle/tree-shaking.

// `getModel`/`fauxProvider` are pi-ai's legacy static-catalog/test API,
// preserved on `/compat`.
import { fauxProvider, getModel } from "@earendil-works/pi-ai/compat";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// Reference everything so nothing is dropped as "unused import".
export const used = {
  createAgentSession,
  ModelRuntime,
  ModelRegistry,
  SessionManager,
  DefaultResourceLoader,
  fauxProvider,
  getModel,
};
console.log(Object.keys(used).length, "symbols referenced");
