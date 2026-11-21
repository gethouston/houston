export function managerReachable(input: {
  showAssistant: boolean;
  onboardingActive: boolean;
}): boolean {
  return input.showAssistant || input.onboardingActive;
}
