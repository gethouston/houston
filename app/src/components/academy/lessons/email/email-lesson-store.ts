import { create } from "zustand";
import type { EmailAsk } from "../../../../lib/academy/email-lesson/email-task";

interface EmailLessonState {
  pickedAgentId: string | null;
  pick: (agentId: string) => void;
  ask: EmailAsk | null;
  setAsk: (ask: EmailAsk | null) => void;
}

export const useEmailLessonStore = create<EmailLessonState>((set) => ({
  pickedAgentId: null,
  pick: (agentId) => set({ pickedAgentId: agentId }),
  ask: null,
  setAsk: (ask) => set({ ask }),
}));
