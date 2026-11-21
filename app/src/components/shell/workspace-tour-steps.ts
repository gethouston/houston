export const TOUR_TARGETS = [
  "workspaceMenu",
  "agents",
  "main",
  "newMission",
  "nav-integrations",
  "nav-ai-hub",
  "nav-settings",
  "nav-academy",
  "newAgent",
  "mobileMenu",
  "mobileAgentsTab",
  "taskChat",
] as const;

export type TourTarget = (typeof TOUR_TARGETS)[number];

export function tourSelector(target: TourTarget): string {
  return `[data-tour-target='${target}']`;
}

export function composerSendSelector(within: TourTarget): string {
  return `${tourSelector(within)} [data-composer-submit]`;
}

export function tourAnchor(target: TourTarget): {
  "data-tour-target": TourTarget;
} {
  return { "data-tour-target": target };
}
