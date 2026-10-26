import {
  ACCOUNT_LINK_SCOPE,
  type AccountLinkView,
} from "@houston/sdk/identity";
import { useSdkSnapshot } from "@houston/sdk/react";
import { identityClient } from "../lib/auth";

/** The account-exists flow's snapshot, published by the SDK identity module. */
export function useAccountLink(): AccountLinkView {
  return (
    useSdkSnapshot<AccountLinkView>(identityClient, ACCOUNT_LINK_SCOPE) ??
    identityClient.getAccountLink()
  );
}
