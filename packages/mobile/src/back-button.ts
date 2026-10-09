import { canNavigateBack, type NavState } from "@houston/app/lib/nav-stack";

export interface BackNavigation {
  state(): NavState;
  back(): void;
  minimize(): Promise<void>;
}

export async function handleHardwareBack(nav: BackNavigation): Promise<void> {
  if (canNavigateBack(nav.state())) {
    nav.back();
  } else {
    await nav.minimize();
  }
}
