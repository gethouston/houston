import { isIdentityConfigured } from "../lib/identity";
import { useMyEditableProfile } from "./queries/use-my-editable-profile";
import { useSession } from "./use-session";

export function useProfileAvailable(): boolean {
  const { data: session } = useSession();
  const { data } = useMyEditableProfile();
  return isIdentityConfigured() && !!session && data != null;
}
