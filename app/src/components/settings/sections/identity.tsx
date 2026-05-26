import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";

import {
  useIdentity,
  useRevokeIdentity,
} from "../../../hooks/queries/use-identity";
import { useUIStore } from "../../../stores/ui";
import { getEngine } from "../../../lib/engine";
import { osRevealPath } from "../../../lib/os-bridge";
import { VerifyIdentityDialog } from "./verify-identity-dialog";

/**
 * Settings → Identity. Renders the user's Beltic-issued user credential
 * (status, trust level, issued/expires, credential id) and the actions
 * to (re-)verify or revoke. Launches the verify modal on the empty CTA.
 */
export function IdentitySection() {
  const { t } = useTranslation("settings");
  const { data: identity, isLoading } = useIdentity();
  const revoke = useRevokeIdentity();
  const addToast = useUIStore((s) => s.addToast);
  const [verifyOpen, setVerifyOpen] = useState(false);

  async function revealEvidence(sha256: string) {
    try {
      const { path } = await getEngine().locateIdentityEvidence(sha256);
      await osRevealPath(path);
    } catch (err) {
      addToast({
        title: t("identity.revealEvidenceFailed"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  }

  const shortId = useMemo(() => {
    if (!identity) return null;
    const id = identity.credential_id;
    if (id.length <= 18) return id;
    return `${id.slice(0, 9)}…${id.slice(-6)}`;
  }, [identity]);

  if (isLoading) {
    return (
      <section className="space-y-2 text-sm text-muted-foreground">
        <h2 className="text-lg font-semibold mb-1 text-foreground">
          {t("identity.title")}
        </h2>
        <p>…</p>
      </section>
    );
  }

  if (!identity || identity.status !== "active") {
    return (
      <section className="space-y-6">
        <header>
          <h2 className="text-lg font-semibold mb-1">{t("identity.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("identity.subtitle")}</p>
        </header>

        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <h3 className="text-base font-semibold">
            {t("identity.emptyTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("identity.emptyDescription")}
          </p>
          <button
            type="button"
            className="rounded-full bg-gray-950 px-3 h-9 text-sm font-medium text-white hover:bg-gray-800"
            onClick={() => setVerifyOpen(true)}
          >
            {t("identity.verifyCta")}
          </button>
        </div>

        <VerifyIdentityDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
      </section>
    );
  }

  const trustLevel =
    (identity.claims as { trust_level?: string } | null)?.trust_level ??
    "self_attested";

  const evidence = parseEvidenceRefs(identity.evidence_refs ?? []);

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold mb-1">{t("identity.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("identity.subtitle")}</p>
      </header>

      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold">
            {t("identity.statusVerified")}
          </span>
          <span className="text-xs rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 h-6 inline-flex items-center font-medium">
            {trustLevel}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label={t("identity.credentialId")}>
            <code className="font-mono">{shortId}</code>
          </Field>
          <Field label={t("identity.trustLevel")}>{trustLevel}</Field>
          <Field label={t("identity.issued")}>
            {formatDate(identity.issued_at)}
          </Field>
          <Field label={t("identity.expires")}>
            {formatDate(identity.expires_at)}
          </Field>
        </dl>

        <div className="pt-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
            {t("identity.verifiedWith")}
          </div>
          {evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("identity.noEvidence")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {evidence.map((e, i) => (
                <li
                  key={`${e.belticId ?? e.sha256}-${i}`}
                  className="text-sm flex items-center gap-2 group"
                >
                  <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium">
                    {t(`identity.verify.document${capitalize(e.docType)}` as Parameters<typeof t>[0], {
                      defaultValue: e.docType,
                    })}
                  </span>
                  <span className="truncate text-foreground/80 flex-1">
                    {e.filename}
                  </span>
                  <code className="font-mono text-xs text-muted-foreground">
                    {e.belticId
                      ? `evidence:${e.belticId.slice(0, 10)}…`
                      : `sha256:${e.sha256.slice(0, 8)}…`}
                  </code>
                  {e.sha256 && (
                    <button
                      type="button"
                      onClick={() => void revealEvidence(e.sha256)}
                      aria-label={t("identity.revealEvidenceAria", {
                        filename: e.filename,
                      })}
                      title={t("identity.revealEvidence")}
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            className="rounded-full border border-black/15 px-3 h-9 text-sm font-medium hover:bg-gray-50"
            onClick={() => setVerifyOpen(true)}
          >
            {t("identity.reverify")}
          </button>
          <button
            type="button"
            className="rounded-full border border-red-300 text-red-700 px-3 h-9 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
            disabled={revoke.isPending}
            onClick={() => {
              if (window.confirm(t("identity.revokeConfirm"))) {
                revoke.mutate();
              }
            }}
          >
            {t("identity.revokeCta")}
          </button>
        </div>
      </div>

      <VerifyIdentityDialog open={verifyOpen} onOpenChange={setVerifyOpen} />
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm font-medium mt-0.5">{children}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

interface ParsedEvidence {
  /** Empty when the ref is `evidence:<id>` (sha256 lives on Beltic only). */
  sha256: string;
  docType: string;
  filename: string;
  /** Set when the ref is `evidence:<id>`. */
  belticId?: string;
}

/**
 * Houston encodes evidence refs two ways:
 *   - `evidence:<ev_uuid>` when the engine successfully forwarded the
 *     bytes to Beltic. The Beltic console + JWT-VC `evidence[]` claim
 *     are the source of truth; this UI only shows that the ref exists.
 *   - `sha256:<hex>:<doctype>:<urlencoded-filename>` opaque fallback
 *     for when Beltic was unreachable at issuance time. Carries the
 *     local-mirror hash so the Reveal-in-Finder button still works.
 *
 * Unknown shapes are skipped.
 */
function parseEvidenceRefs(refs: string[]): ParsedEvidence[] {
  return refs.flatMap((ref) => {
    if (ref.startsWith("evidence:")) {
      const id = ref.slice("evidence:".length);
      if (!id) return [];
      // For `evidence:<id>` refs we don't have the local sha256 or
      // filename inline — they live on Beltic. Render with the Beltic
      // id as the visible token; the Reveal-in-Finder button is
      // hidden for these (the local mirror is keyed by sha256 which
      // we don't have here without a Beltic round trip).
      return [{ sha256: "", docType: "passport", filename: id, belticId: id }];
    }
    const parts = ref.split(":");
    if (parts.length < 3 || parts[0] !== "sha256") return [];
    const [, sha256, docType, ...rest] = parts;
    if (!sha256 || !docType) return [];
    let filename = rest.join(":");
    try {
      filename = decodeURIComponent(filename);
    } catch {
      // leave as-is
    }
    return [{ sha256, docType, filename }];
  });
}

function capitalize(s: string): string {
  return s
    .split("_")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join("");
}
