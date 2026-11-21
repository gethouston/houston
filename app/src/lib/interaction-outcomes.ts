interface StepOutcome {
  name: string;
  message?: string;
}

interface SplitOutcomes {
  completedNames: string[];
  skippedNames: string[];
  redirects: { name: string; text: string }[];
}

function splitOutcomes<T extends StepOutcome>(
  stepIds: string[],
  outcomes: Map<string, T>,
  completed: (outcome: T) => boolean,
): SplitOutcomes {
  const completedNames: string[] = [];
  const skippedNames: string[] = [];
  const redirects: { name: string; text: string }[] = [];
  for (const id of stepIds) {
    const outcome = outcomes.get(id);
    if (!outcome) continue;
    if (completed(outcome)) {
      completedNames.push(outcome.name);
    } else if (outcome.message != null && outcome.message.length > 0) {
      redirects.push({ name: outcome.name, text: outcome.message });
    } else {
      skippedNames.push(outcome.name);
    }
  }
  return { completedNames, skippedNames, redirects };
}

export interface ConnectOutcome extends StepOutcome {
  connected: boolean;
}

export function finalConnectNames(
  connectStepIds: string[],
  outcomes: Map<string, ConnectOutcome>,
): {
  connectedNames: string[];
  skippedConnectNames: string[];
  connectRedirects: { name: string; text: string }[];
} {
  const split = splitOutcomes(connectStepIds, outcomes, (o) => o.connected);
  return {
    connectedNames: split.completedNames,
    skippedConnectNames: split.skippedNames,
    connectRedirects: split.redirects,
  };
}

export interface CredentialOutcome extends StepOutcome {
  saved: boolean;
}

export function finalCredentialNames(
  credentialStepIds: string[],
  outcomes: Map<string, CredentialOutcome>,
): {
  credentialedNames: string[];
  skippedCredentialNames: string[];
  credentialRedirects: { name: string; text: string }[];
} {
  const split = splitOutcomes(credentialStepIds, outcomes, (o) => o.saved);
  return {
    credentialedNames: split.completedNames,
    skippedCredentialNames: split.skippedNames,
    credentialRedirects: split.redirects,
  };
}

export interface HandsOnOutcome extends StepOutcome {
  finished: boolean;
}

export function finalHandsOnNames(
  handsOnStepIds: string[],
  outcomes: Map<string, HandsOnOutcome>,
): {
  finishedScreens: string[];
  skippedScreens: string[];
  handsOnRedirects: { name: string; text: string }[];
} {
  const split = splitOutcomes(handsOnStepIds, outcomes, (o) => o.finished);
  return {
    finishedScreens: split.completedNames,
    skippedScreens: split.skippedNames,
    handsOnRedirects: split.redirects,
  };
}
