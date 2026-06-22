// Minimal "what the engine actually uses" entry, to measure bundle/tree-shaking.
import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  DefaultResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { registerFauxProvider, getModel } from "@earendil-works/pi-ai";
import {
  loginOpenAICodexDeviceCode,
  loginAnthropic,
} from "@earendil-works/pi-ai/oauth";

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
