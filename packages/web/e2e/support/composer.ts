export const NEW_TASK_PLACEHOLDER = "What should the AI Employee work on?";
export const FOLLOW_UP_PLACEHOLDER = "Send a follow-up...";
export const ASSISTANT_PLACEHOLDER = "What should Houston work on?";

export const ASSISTANT_COMPOSER = new RegExp(
  `^(?:${[ASSISTANT_PLACEHOLDER, FOLLOW_UP_PLACEHOLDER]
    .map((copy) => copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})$`,
);
