import type { MyAgent } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getEngine } from "../../lib/engine";
import { reportError } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";

/** The owner-dashboard query key, invalidated after every owner mutation. */
const MY_AGENTS_KEY = ["store-my-agents"] as const;

/**
 * The "my agents" owner dashboard's data + mutations. The list query runs only
 * when the panel is mounted AND the user is signed in (`enabled`) — the gateway
 * `GET /me/agents` needs the caller's session bearer. Each mutation invalidates
 * the list on success so the row's lifecycle badges/actions re-render from the
 * server truth, and surfaces failure as a visible toast plus a Sentry report
 * (the same "no silent failures" path the one-click install uses).
 *
 * "Request public listing" is the one action the server truth cannot echo — the
 * gateway stamps `public_requested_at` but never changes the summary's
 * state/visibility and does not project the flag — so a bare invalidate would
 * leave the row identical and read as broken. It gets a success toast and a
 * session-local `requestedPublicIds` acknowledgment (`wasRequestedPublic`) so
 * the button downgrades to a disabled "pending review" state and cannot be
 * re-submitted blindly.
 */
export function useMyStoreAgents(enabled: boolean) {
  const qc = useQueryClient();
  const { t } = useTranslation("store");
  const addToast = useUIStore((s) => s.addToast);
  const [requestedPublicIds, setRequestedPublicIds] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const query = useQuery({
    queryKey: MY_AGENTS_KEY,
    queryFn: () => getEngine().listMyStoreAgents(),
    enabled,
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: MY_AGENTS_KEY });

  const surface = (command: string, err: unknown) => {
    reportError(command, `${command} failed`, err);
    addToast({ variant: "error", title: t("myAgents.actionFailed") });
  };

  const requestPublic = useMutation({
    mutationFn: (id: string) => getEngine().requestStorePublic(id),
    onSuccess: (_result, id) => {
      setRequestedPublicIds((prev) => new Set(prev).add(id));
      addToast({ variant: "success", title: t("myAgents.requestPublicSent") });
      invalidate();
    },
    onError: (err) => surface("store_request_public", err),
  });

  const makeUnlisted = useMutation({
    mutationFn: (id: string) => getEngine().setStoreVisibilityUnlisted(id),
    onSuccess: invalidate,
    onError: (err) => surface("store_make_unlisted", err),
  });

  const unpublish = useMutation({
    mutationFn: (id: string) => getEngine().unpublishStoreAgentById(id),
    onSuccess: invalidate,
    onError: (err) => surface("store_unpublish", err),
  });

  const remove = useMutation({
    mutationFn: (id: string) => getEngine().deleteStoreAgentById(id),
    onSuccess: invalidate,
    onError: (err) => surface("store_delete", err),
  });

  const mutations = [requestPublic, makeUnlisted, unpublish, remove];
  const isBusy = (id: string): boolean =>
    mutations.some((m) => m.isPending && m.variables === id);
  const isRequestingPublic = (id: string): boolean =>
    requestPublic.isPending && requestPublic.variables === id;
  const wasRequestedPublic = (id: string): boolean =>
    requestedPublicIds.has(id);

  return {
    agents: (query.data ?? []) as MyAgent[],
    isPending: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
    requestPublic,
    makeUnlisted,
    unpublish,
    remove,
    isBusy,
    isRequestingPublic,
    wasRequestedPublic,
  };
}
