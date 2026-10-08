export interface AppStateManagers {
  online(online: boolean): void;
  focused(focused: boolean): void;
}

/** Mirror TanStack Query's browser focus and online refresh on native resume. */
export function applyNativeAppState(
  isActive: boolean,
  isOnline: boolean,
  managers: AppStateManagers,
): void {
  if (isActive) managers.online(isOnline);
  managers.focused(isActive);
}
