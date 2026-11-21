import { ConversationVmOutput, ScopeStore } from "@houston/sdk";

export const conversationStore = new ScopeStore();

export const conversationVm = new ConversationVmOutput(conversationStore);
