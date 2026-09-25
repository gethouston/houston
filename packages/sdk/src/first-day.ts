/**
 * Subpath re-export of the first-day vocabulary surfaces render with
 * (`@houston/sdk/first-day`): the setup task's mode sentinel and the hello's
 * wording. Both live once in `@houston/domain`, because the host builds the
 * first-day prompt from the same hello the chat renders.
 */
export {
  englishSetupGreeting,
  roleInSentence,
  type SetupGreetingCopy,
  type SetupGreetingVariant,
  setupGreetingCopy,
  setupGreetingVariant,
} from "@houston/domain/first-day-greeting";
export {
  AGENT_SETUP_AGENT_MODE,
  isAgentSetupMode,
} from "@houston/domain/first-day-mode";
