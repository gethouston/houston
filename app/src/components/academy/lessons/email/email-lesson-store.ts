import { create } from "zustand";
import type { EmailAsk } from "../../../../lib/academy/email-lesson/email-task";

/**
 * What the email lesson carries from one beat to the next, in session memory
 * only: which AI Employee the user picked to send, and the tasks that AI
 * Employee already had when the request was put in front of the user (how the
 * watch beat finds the new one). So the ask beat names the sender beat as its
 * `resumeOn` (`registry.ts`): a run resumed after a restart asks again rather
 * than sending from a default.
 */
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
