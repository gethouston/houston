import { fauxProvider, getModel } from "@earendil-works/pi-ai/compat";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

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
