import type {
  EditableProfile,
  EditableProfileUpdate,
} from "@houston-ai/engine-client";
import {
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { isIdentityConfigured } from "../../lib/identity";
import { queryKeys } from "../../lib/query-keys";
import { tauriProfile } from "../../lib/tauri";
import { useSession } from "../use-session";
import { ORG_PEOPLE_KEY } from "./use-org-people";
import { USER_PROFILES_KEY } from "./use-user-profiles";

/** Query key for the signed-in user's own editable display profile. */
export const MY_EDITABLE_PROFILE_KEY = "my-editable-profile";

/**
 * The signed-in user's OWN display profile (name + photo) from the gateway's
 * `GET /v1/me/profile`: the EFFECTIVE values, plus `custom` telling the form
 * which of them the user set by hand rather than inheriting from Google (that
 * flag is what makes "Remove picture" meaningful).
 *
 * Deliberately NOT multiplayer-gated, unlike `useOrgPeople` — naming
 * yourself is not a team feature; every signed-in user gets it. It only needs a
 * configured identity backend and a live session. Off-gateway, or on a gateway
 * predating the route (which 404s), the read degrades to `null` and the caller
 * hides the profile section rather than offering an editor that cannot save.
 * A failure never toasts and is never captured (see `tauriProfile.get`): it is
 * indistinguishable from "this host has no such feature" by design.
 *
 * Cached generously — a profile changes when the user changes it, and that path
 * writes the fresh value straight into this cache ({@link useSetMyProfile}).
 */
export function useMyEditableProfile(): UseQueryResult<EditableProfile | null> {
  const { data: session } = useSession();

  return useQuery({
    queryKey: [MY_EDITABLE_PROFILE_KEY],
    queryFn: () => tauriProfile.get(),
    enabled: isIdentityConfigured() && !!session,
    staleTime: 5 * 60_000,
  });
}

/**
 * Save the user's own name and/or photo. Per key: a string sets, `null` clears
 * back to the Google value, an omitted key leaves that field untouched — so an
 * editor that only changed the name must send only `displayName`.
 *
 * `onSuccess` seeds the returned profile into this hook's cache (the host's
 * truth, not an optimistic guess) and then invalidates every OTHER cache that
 * paints a face or a name, so the change lands everywhere at once instead of
 * only in the settings form:
 * - `USER_PROFILES_KEY` by prefix — the caller's own self-face plus every
 *   teammate face stack (each is `[USER_PROFILES_KEY, ...ids]`);
 * - `ORG_PEOPLE_KEY` — the @mention roster the composer and renderer read;
 * - `queryKeys.org()` — the People roster behind the Permissions/Admin views.
 *
 * Carries no `onError`: `tauriProfile.set` routes through `call()`, which
 * already surfaces the failure as a red toast AND reports it to Sentry once
 * (the host's 400 for a too-long name or an oversized picture included).
 * Adding an `onError` here would double-toast.
 */
export function useSetMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: EditableProfileUpdate) => tauriProfile.set(update),
    onSuccess: (data) => {
      qc.setQueryData([MY_EDITABLE_PROFILE_KEY], data);
      qc.invalidateQueries({ queryKey: [USER_PROFILES_KEY] });
      qc.invalidateQueries({ queryKey: [ORG_PEOPLE_KEY] });
      qc.invalidateQueries({ queryKey: queryKeys.org() });
    },
  });
}
