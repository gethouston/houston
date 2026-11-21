import {
  ACCOUNT_LINK_SCOPE,
  type AccountLinkView,
} from "@houston/sdk/identity";
import { useSdkSnapshot } from "@houston/sdk/react";
import { identityClient } from "../lib/auth";

export function useAccountLink(): AccountLinkView {
  return (
    useSdkSnapshot<AccountLinkView>(identityClient, ACCOUNT_LINK_SCOPE) ??
    identityClient.getAccountLink()
  );
}
