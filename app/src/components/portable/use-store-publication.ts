/**
 * Loads and mutates an agent's Agent Store publication for the share wizard.
 * Publishing is account-based (the user's own gateway bearer, no manage tokens);
 * this hook drives the adapter's publish/update/unpublish/status calls. Every
 * action surfaces its failure as a toast (the store's own reason when it has
 * one) and never swallows the error.
 */

import type {
  StorePublicationStatus,
  StorePublishRequest,
  StorePublishResponse,
  StoreUpdateResponse,
} from "@houston-ai/engine-client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getEngine } from "../../lib/engine";
import { classifyStorePublishError } from "../../lib/store-publish-errors";
import { useUIStore } from "../../stores/ui";

export interface UseStorePublication {
  status: StorePublicationStatus | null;
  loading: boolean;
  busy: boolean;
  publish: (req: StorePublishRequest) => Promise<StorePublishResponse | null>;
  update: (req: StorePublishRequest) => Promise<StoreUpdateResponse | null>;
  unpublish: () => Promise<boolean>;
}

export function useStorePublication(
  agentPath: string | null,
): UseStorePublication {
  const { t } = useTranslation("portable");
  const addToast = useUIStore((s) => s.addToast);
  const [status, setStatus] = useState<StorePublicationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Store failures arrive as snake_case machine codes, not sentences, so map
  // known codes to localized copy and only pass a store reason through when it
  // is genuine prose ("that name is taken"). Unknown failures fall back to the
  // generic message. Always log the raw diagnostic first.
  const describe = useCallback(
    (command: string, err: unknown): string => {
      const raw = err instanceof Error ? err.message : String(err);
      console.error(`[${command}] ${raw}`);
      const resolved = classifyStorePublishError(err);
      if (resolved?.kind === "key") return t(resolved.key);
      if (resolved?.kind === "text") return resolved.text;
      return t("publish.errors.generic");
    },
    [t],
  );

  useEffect(() => {
    if (!agentPath) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const s = await getEngine().getStorePublication(agentPath);
        if (!cancelled) setStatus(s);
      } catch (err) {
        if (!cancelled) {
          addToast({
            variant: "error",
            title: t("publish.errors.statusFailed"),
            description: describe("store_status", err),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentPath, addToast, describe, t]);

  const publish = useCallback(
    async (req: StorePublishRequest) => {
      if (!agentPath) return null;
      setBusy(true);
      try {
        const res = await getEngine().publishAgentToStore(agentPath, req);
        setStatus((prev) => ({
          published: true,
          linked: true,
          shareUrl: res.shareUrl,
          slug: res.slug,
          storeAgentId: res.storeAgentId,
          publishedAt: prev?.publishedAt ?? new Date().toISOString(),
          storeUrl: prev?.storeUrl ?? res.shareUrl,
          identity: req.identity,
        }));
        return res;
      } catch (err) {
        addToast({
          variant: "error",
          title: t("publish.errors.publishFailed"),
          description: describe("store_publish", err),
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [agentPath, addToast, describe, t],
  );

  const update = useCallback(
    async (req: StorePublishRequest) => {
      if (!agentPath) return null;
      setBusy(true);
      try {
        const res = await getEngine().updateStorePublication(agentPath, req);
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                published: true,
                linked: true,
                shareUrl: res.shareUrl,
                slug: res.slug,
                identity: req.identity,
              }
            : prev,
        );
        return res;
      } catch (err) {
        addToast({
          variant: "error",
          title: t("publish.errors.updateFailed"),
          description: describe("store_update", err),
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [agentPath, addToast, describe, t],
  );

  const unpublish = useCallback(async () => {
    if (!agentPath) return false;
    setBusy(true);
    try {
      await getEngine().unpublishFromStore(agentPath);
      // The pointer survives an unpublish (re-publish reuses the same store
      // agent), so the agent stays linked, just no longer published.
      setStatus((prev) =>
        prev
          ? { ...prev, published: false, linked: true }
          : { published: false, linked: false, storeUrl: "" },
      );
      return true;
    } catch (err) {
      addToast({
        variant: "error",
        title: t("publish.errors.unpublishFailed"),
        description: describe("store_unpublish", err),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }, [agentPath, addToast, describe, t]);

  return { status, loading, busy, publish, update, unpublish };
}
