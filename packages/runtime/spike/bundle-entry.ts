// Minimal "what the engine actually uses" entry, to measure bundle/tree-shaking.

// `getModel`/`registerFauxProvider` are pi-ai's legacy global-registry API,
// preserved on `/compat`.
import { getModel, registerFauxProvider } from "@earendil-works/pi-ai/compat";
import {
  loginAnthropic,
  loginOpenAICodexDeviceCode,
} from "@earendil-works/pi-ai/oauth";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// Reference everything so nothing is dropped as "unused import".
export const used = {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  DefaultResourceLoader,
  registerFauxProvider,
  getModel,
  loginOpenAICodexDeviceCode,
  loginAnthropic,
};
console.log(Object.keys(used).length, "symbols referenced");
