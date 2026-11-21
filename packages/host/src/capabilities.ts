import { getProviders } from "@earendil-works/pi-ai/compat";
import type { Capabilities } from "@houston/protocol";
import { QWEN_PROVIDER_ID } from "./providers/qwen-dashscope";

const HOSTED_PROVIDERS: readonly string[] = [
  ...getProviders(),
  QWEN_PROVIDER_ID,
].sort();

export const LOCAL_CAPABILITIES: Capabilities = {
  profile: "local",
  officePreview: false,
  revealInOs: true,
  terminal: true,
  tunnel: false,
  codeExecution: "local-bash",
  providers: [...HOSTED_PROVIDERS],
  openaiCompatible: true,
  integrations: ["composio"],
  sharedSkills: true,
  agentDelegation: true,
};

export const CLOUD_CAPABILITIES: Capabilities = {
  profile: "cloud",
  officePreview: false,
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: [...HOSTED_PROVIDERS],
  openaiCompatible: true,
  integrations: ["composio"],
  sharedSkills: false,
  agentDelegation: true,
};

export const MANAGED_CLOUD_CAPABILITIES: Capabilities = {
  profile: "cloud",
  officePreview: false,
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "local-bash",
  providers: [...HOSTED_PROVIDERS],
  openaiCompatible: true,
  integrations: ["composio"],
  sharedSkills: false,
  agentDelegation: true,
};
