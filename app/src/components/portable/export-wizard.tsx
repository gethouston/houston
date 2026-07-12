/**
 * The share hub for an agent. Two first-class outcomes off the same pick +
 * anonymize pipeline: save a portable `.houstonagent` file, or publish a
 * listing to the Agent Store. When the agent is already published the wizard
 * opens straight into the manage view (update / remove).
 *
 * Steps (dots follow the active path):
 *   pick → anonymize → review → { Save file | Publish → listing → share }
 * and, for an already-listed agent, a manage view instead of `pick`.
 *
 * Visual language follows `knowledge-base/design-system.md`. Step bodies live
 * in sibling files; this file is the orchestrator + footer.
 */

import { Button, Dialog, DialogContent } from "@houston-ai/core";
import type {
  PortableInventoryPreview,
  StorePublishIdentity,
} from "@houston-ai/engine-client";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../../hooks/use-session";
import { analytics } from "../../lib/analytics";
import { signInWithGoogle } from "../../lib/auth";
import { getEngine } from "../../lib/engine";
import { genericErrorDescription } from "../../lib/error-toast";
import { osRevealPath } from "../../lib/os-bridge";
import {
  buildAnonymizeOverrides,
  buildStorePublishRequest,
  droppedLearningIds,
  isListingComplete,
  type ListingForm,
  toExportSelection,
  type WizardSelection,
} from "../../lib/portable-share";
import { isAuthConfigured } from "../../lib/supabase";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AnonymizeStep } from "./anonymize-step";
import { ListingStep } from "./listing-step";
import { ManagePublication } from "./manage-publication";
import { PickStep } from "./pick-step";
import { ReviewStep, ShareStep } from "./review-step";
import { useAnonymize } from "./use-anonymize";
import { useStorePublication } from "./use-store-publication";
import { WizardHeader } from "./wizard-parts";

type Step = "pick" | "anonymize" | "review" | "listing" | "share";
type Origin = "new" | "update";

const EMPTY_LISTING: ListingForm = {
  description: "",
  tagline: "",
  category: "",
  tags: [],
  creatorName: "",
  creatorUrl: "",
};

function listingFromIdentity(id?: StorePublishIdentity | null): ListingForm {
  return {
    description: id?.description ?? "",
    tagline: id?.tagline ?? "",
    category: id?.category ?? "",
    tags: id?.tags ?? [],
    creatorName: "",
    creatorUrl: "",
  };
}

export function ExportAgentWizard() {
  const { t } = useTranslation("portable");
  const agentId = useUIStore((s) => s.shareAgentId);
  const setAgentId = useUIStore((s) => s.setShareAgentId);
  const addToast = useUIStore((s) => s.addToast);
  const agents = useAgentStore((s) => s.agents);
  const agent = agents.find((a) => a.id === agentId);
  const open = Boolean(agentId);
  const pub = useStorePublication(agent?.folderPath ?? null);
  const { data: session } = useSession();
  // Publishing to the Agent Store needs the user's own account (the app POSTs
  // with their gateway bearer). Signed-out users get a sign-in CTA, never a
  // dead button; a build with no auth baked can't publish, so hide the option.
  const canPublish = isAuthConfigured();
  const signedIn = Boolean(session);
  const [signingIn, setSigningIn] = useState(false);

  const [step, setStep] = useState<Step>("pick");
  const [intent, setIntent] = useState<"save" | "publish">("save");
  const [origin, setOrigin] = useState<Origin>("new");
  const [managing, setManaging] = useState(true);
  const [preview, setPreview] = useState<PortableInventoryPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<WizardSelection>({
    claudeMd: true,
    skillSlugs: new Set(),
    routineIds: new Set(),
    learningIds: new Set(),
  });
  const anon = useAnonymize({
    agentPath: agent?.folderPath ?? null,
    preview,
    selection,
  });
  const [listing, setListing] = useState<ListingForm>(EMPTY_LISTING);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setStep("pick");
      setIntent("save");
      setOrigin("new");
      setManaging(true);
      setPreview(null);
      anon.reset();
      setListing(EMPTY_LISTING);
      setShareUrl(null);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const p = await getEngine().portablePreview(agent?.folderPath ?? "");
        setPreview(p);
        setSelection({
          claudeMd: Boolean(p.claudeMd),
          skillSlugs: new Set(p.skills.map((s) => s.slug)),
          routineIds: new Set(p.routines.map((r) => r.id)),
          learningIds: new Set(p.learnings.map((l) => l.id)),
        });
      } catch (err) {
        addToast({
          variant: "error",
          title: t("export.errors.previewFailed"),
          description: genericErrorDescription("export_preview", err),
        });
        setAgentId(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId, agent?.folderPath, addToast, setAgentId, anon.reset, t]);

  const counts = useMemo(
    () => ({
      skills: selection.skillSlugs.size,
      routines: selection.routineIds.size,
      learnings: selection.learningIds.size,
    }),
    [selection],
  );

  const handleClose = useCallback(() => setAgentId(null), [setAgentId]);

  const gatheredSelection = () =>
    toExportSelection(
      selection,
      droppedLearningIds(
        anon.wantAnonymize ?? false,
        anon.anonymized,
        anon.accept,
      ),
    );
  const gatheredOverrides = () =>
    buildAnonymizeOverrides(
      anon.wantAnonymize ?? false,
      anon.anonymized,
      anon.accept,
    );

  const handleSave = async () => {
    if (!agent || !preview) return;
    setSaving(true);
    try {
      const bytes = await getEngine().portablePackage(agent.folderPath, {
        selection: gatheredSelection(),
        overrides: gatheredOverrides(),
        meta: {
          agentId: agent.configId ?? agent.id,
          agentName: agent.name,
          anonymized: anon.wantAnonymize ?? false,
        },
      });
      const filename = `${agent.name.replace(/[^a-z0-9._-]+/gi, "-")}.houstonagent`;
      const u8 = new Uint8Array(bytes);
      const savedPath = await invoke<string | null>("save_portable_agent", {
        default_name: filename,
        bytes: Array.from(u8),
      });
      if (savedPath) {
        analytics.track("agent_shared", { agent_slug: agent.id });
        addToast({
          variant: "success",
          title: t("export.toasts.savedTitle"),
          description: t("export.toasts.savedDescription", { path: savedPath }),
          action: {
            label: t("export.toasts.revealAction"),
            onClick: () => {
              void osRevealPath(savedPath).catch((err) =>
                addToast({
                  variant: "error",
                  title: t("export.errors.revealFailed"),
                  description: genericErrorDescription("export_reveal", err),
                }),
              );
            },
          },
        });
        handleClose();
      }
    } catch (err) {
      addToast({
        variant: "error",
        title: t("export.errors.saveFailed"),
        description: genericErrorDescription("export_save", err),
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!agent) return;
    const req = buildStorePublishRequest({
      name: agent.name,
      form: listing,
      selection: gatheredSelection(),
      overrides: gatheredOverrides(),
      anonymized: anon.wantAnonymize ?? false,
    });
    const res =
      origin === "update" ? await pub.update(req) : await pub.publish(req);
    if (!res) return;
    if (origin === "new")
      analytics.track("agent_published", { agent_slug: res.slug });
    setShareUrl(res.shareUrl);
    setStep("share");
  };

  const startSignIn = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setSigningIn(false);
      addToast({
        variant: "error",
        title: t("publish.errors.signInFailed"),
        description: genericErrorDescription("store_sign_in", err),
      });
    }
  };

  const goToListing = () => {
    setIntent("publish");
    setOrigin("new");
    setStep("listing");
  };

  const startUpdate = () => {
    setOrigin("update");
    setIntent("publish");
    setManaging(false);
    setListing(listingFromIdentity(pub.status?.identity));
    setStep("pick");
  };

  const handleRemove = async () => {
    if (await pub.unpublish()) {
      addToast({
        variant: "success",
        title: t("publish.toasts.removedTitle"),
        description: t("publish.toasts.removedBody", {
          name: agent?.name ?? "",
        }),
      });
      handleClose();
    }
  };

  if (!open) return null;

  const showManage = managing && pub.status?.published === true;
  const sequence: Step[] =
    origin === "update"
      ? ["pick", "anonymize", "listing", "share"]
      : intent === "publish"
        ? ["pick", "anonymize", "review", "listing", "share"]
        : ["pick", "anonymize", "review"];
  const stepIndex = Math.max(0, sequence.indexOf(step));

  // "help me anonymize" alone isn't enough: a run must have completed, else we
  // would stamp anonymized: true with zero redactions applied.
  const canAdvance =
    step === "pick"
      ? !loading && !!preview
      : step === "anonymize"
        ? anon.wantAnonymize !== null &&
          !anon.anonymizing &&
          (!anon.wantAnonymize || anon.anonymized !== null)
        : true;

  const goNext = () => {
    if (step === "pick") setStep("anonymize");
    else if (step === "anonymize")
      setStep(origin === "update" ? "listing" : "review");
  };
  const goBack = () => {
    if (step === "anonymize") setStep("pick");
    else if (step === "review") setStep("anonymize");
    else if (step === "listing")
      setStep(origin === "update" ? "anonymize" : "review");
    else handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[680px] h-[78vh] flex flex-col p-0 gap-0 overflow-hidden">
        <WizardHeader
          eyebrow={t("export.eyebrow", { name: agent?.name ?? "" })}
          index={showManage ? 0 : stepIndex}
          total={showManage ? 1 : sequence.length}
        />

        <div className="flex-1 min-h-0 overflow-y-auto px-8 pt-2 pb-6">
          {pub.loading ? (
            <p className="text-sm text-muted-foreground">
              {t("export.loading")}
            </p>
          ) : showManage ? (
            <ManagePublication
              agentName={agent?.name ?? ""}
              shareUrl={pub.status?.shareUrl ?? ""}
              busy={pub.busy}
              onUpdate={startUpdate}
              onRemove={handleRemove}
            />
          ) : loading ? (
            <p className="text-sm text-muted-foreground">
              {t("export.loading")}
            </p>
          ) : !preview ? (
            <p className="text-sm text-muted-foreground">
              {t("export.errors.noPreview")}
            </p>
          ) : step === "pick" ? (
            <PickStep
              preview={preview}
              selection={selection}
              setSelection={setSelection}
            />
          ) : step === "anonymize" ? (
            <AnonymizeStep
              wantAnonymize={anon.wantAnonymize}
              onChoose={anon.setWantAnonymize}
              useAi={anon.useAi}
              onToggleAi={anon.setUseAi}
              onStart={() => void anon.run()}
              anonymizing={anon.anonymizing}
              progress={anon.progress}
              slow={anon.slow}
              stopped={anon.stopped}
              onStop={anon.stopWaiting}
              anonymized={anon.anonymized}
              accept={anon.accept}
              setAccept={anon.setAccept}
            />
          ) : step === "review" ? (
            <ReviewStep
              agentName={agent?.name ?? ""}
              counts={counts}
              anonymized={anon.wantAnonymize ?? false}
            />
          ) : step === "listing" ? (
            <ListingStep
              agentName={agent?.name ?? ""}
              value={listing}
              onChange={setListing}
            />
          ) : (
            <ShareStep
              agentName={agent?.name ?? ""}
              shareUrl={shareUrl ?? ""}
            />
          )}
        </div>

        {!showManage && !pub.loading && (
          <footer className="shrink-0 px-8 py-4 flex items-center justify-between gap-3">
            {step === "share" ? (
              <span />
            ) : (
              <button
                type="button"
                onClick={goBack}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {step === "pick"
                  ? t("export.actions.cancel")
                  : t("export.actions.back")}
              </button>
            )}
            {step === "review" ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? t("export.actions.saving")
                    : t("export.actions.save")}
                </Button>
                {canPublish &&
                  (signedIn ? (
                    <Button className="rounded-full" onClick={goToListing}>
                      {t("publish.actions.publish")}
                    </Button>
                  ) : (
                    <Button
                      className="rounded-full"
                      onClick={() => void startSignIn()}
                      disabled={signingIn}
                    >
                      {signingIn
                        ? t("publish.actions.signingIn")
                        : t("publish.actions.signInToPublish")}
                    </Button>
                  ))}
              </div>
            ) : step === "listing" ? (
              <Button
                className="rounded-full"
                onClick={() => void handlePublish()}
                disabled={pub.busy || !isListingComplete(listing)}
              >
                {pub.busy
                  ? t("publish.actions.publishing")
                  : origin === "update"
                    ? t("publish.actions.saveUpdate")
                    : t("publish.actions.publishNow")}
              </Button>
            ) : step === "share" ? (
              <Button className="rounded-full" onClick={handleClose}>
                {t("publish.actions.done")}
              </Button>
            ) : (
              <Button
                className="rounded-full"
                onClick={goNext}
                disabled={!canAdvance}
              >
                {t("export.actions.next")}
              </Button>
            )}
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
