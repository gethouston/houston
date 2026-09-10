import type { UpdateOrigin } from "./update-policy";

/**
 * Which update check is THE launch check: the first one this app process
 * runs, and only that one.
 *
 * The updater hook is mounted inside `<App/>`, which React remounts as a
 * matter of course: `IdentityKeyedApp` keys it by the signed-in uid and swaps
 * in the splash while the session query is pending, so a session reset, a
 * re-login or a signed-out gap all tear the tree down and build it again. A
 * per-mount "first check" flag calls the first check after ANY of those a
 * launch check, and a release the poll had just found mid-session (or finds a
 * second later) lands behind the upgrading overlay: the install-now path the
 * background policy exists to keep away from a working user.
 *
 * The claim therefore lives outside React: at module scope, which survives a
 * remount, and in `sessionStorage`, which survives a webview reload. Neither
 * outlives the process (a new app launch starts a fresh session), so the
 * launch check is exactly one check per launch.
 */
const STORAGE_KEY = "houston.updater.launch-check-claimed";
let claimedInMemory = false;

function storage(): Storage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

/** Hands the launch origin to the first caller of this process and the
 *  mid-session origin to every caller after it. */
export function claimLaunchCheck(): UpdateOrigin {
  const store = storage();
  if (claimedInMemory || store?.getItem(STORAGE_KEY) === "1") return "poll";
  claimedInMemory = true;
  store?.setItem(STORAGE_KEY, "1");
  return "launch";
}

/** Forgets the claim (memory and session), so a test starts as a fresh
 *  process. */
export function resetLaunchCheckClaimForTests(): void {
  claimedInMemory = false;
  storage()?.removeItem(STORAGE_KEY);
}
