import type {
  EditableProfile,
  EditableProfileUpdate,
} from "@houston/engine-adapter";
import {
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { patchEditableProfile } from "../../lib/editable-profile-patch";
import { isIdentityConfigured } from "../../lib/identity";
import type { OptimisticFailureCopy } from "../../lib/optimistic-core";
import { optimisticWrite } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { tauriProfile } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { useSession } from "../use-session";
import { ORG_PEOPLE_KEY } from "./use-org-people";
import { USER_PROFILES_KEY } from "./use-user-profiles";

export const MY_EDITABLE_PROFILE_KEY = "my-editable-profile";

export function useMyEditableProfile(): UseQueryResult<EditableProfile | null> {
  const { data: session } = useSession();

  return useQuery({
    queryKey: [MY_EDITABLE_PROFILE_KEY],
    queryFn: () => tauriProfile.get(),
    enabled: isIdentityConfigured() && !!session,
    staleTime: 5 * 60_000,
  });
}

export interface ProfileSaveCopy {
  failure: OptimisticFailureCopy;
  saved: string;
}

export function useSetMyProfile(): (
  update: EditableProfileUpdate,
  copy: ProfileSaveCopy,
) => Promise<void> {
  const qc = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  return useCallback(
    (update, copy) =>
      optimisticWrite({
        qc,
        command: "set_my_profile",
        patches: [
          {
            queryKey: [MY_EDITABLE_PROFILE_KEY],
            apply: (profile: EditableProfile | null | undefined) =>
              patchEditableProfile(profile, update),
          },
        ],
        write: () => tauriProfile.set(update),
        failure: copy.failure,
        invalidate: [
          [MY_EDITABLE_PROFILE_KEY],
          [USER_PROFILES_KEY],
          [ORG_PEOPLE_KEY],
          queryKeys.org(),
        ],
        onSuccess: (data) => {
          qc.setQueryData([MY_EDITABLE_PROFILE_KEY], data);
          addToast({ title: copy.saved });
        },
      }),
    [qc, addToast],
  );
}
