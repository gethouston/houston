/**
 * Pure state -> presentation mapping for the store-driven
 * `ProviderReconnectCard`.
 *
 * The card has two states, keyed on `loginLaunched`: the resting "sign in"
 * prompt and the "finish in your browser" state after a launch. The launched
 * button used to borrow `common:actions.tryAgain` ("Try again"), which read as
 * a message-retry; it now names its real action, "Sign in again". Extracted so
 * both states are unit-testable without mounting React.
 */

export interface ReconnectCardPresentation {
  descriptionKey: string;
  buttonLabelKey: string;
  buttonVariant: "outline" | "default";
}

export function resolveReconnectCardPresentation(args: {
  loginLaunched: boolean;
  loginError: boolean;
}): ReconnectCardPresentation {
  const { loginLaunched, loginError } = args;
  return {
    descriptionKey: loginError
      ? "shell:providerReconnect.launchError"
      : loginLaunched
        ? "shell:providerReconnect.waiting"
        : "shell:providerReconnect.body",
    buttonLabelKey: loginLaunched
      ? "shell:providerReconnect.signInAgain"
      : "shell:authReconnect.signInWith",
    buttonVariant: loginLaunched ? "outline" : "default",
  };
}
