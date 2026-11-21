import type { CheckOrigin } from "./update-policy";

const STORAGE_KEY = "houston.updater.launch-check-claimed";
let claimedInMemory = false;

function storage(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

export function claimLaunchCheck(): CheckOrigin {
  const store = storage();
  if (claimedInMemory || store?.getItem(STORAGE_KEY) === "1") return "poll";
  claimedInMemory = true;
  store?.setItem(STORAGE_KEY, "1");
  return "launch";
}

export function resetLaunchCheckClaimForTests(): void {
  claimedInMemory = false;
  storage()?.removeItem(STORAGE_KEY);
}
