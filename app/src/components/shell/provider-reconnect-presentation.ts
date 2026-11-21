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
