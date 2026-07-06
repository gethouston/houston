/**
 * "Your agent is still being created" notice (HOU-693). Opens when the user
 * triggers a write (save, create, update…) on an agent whose engine is still
 * warming up — the tabs stay explorable, this dialog is the only blocker.
 * Mirrors the boot splash's helmet-in-motion so the wait reads as the same
 * continuous "getting ready" state. Closes itself if the agent turns ready
 * while it is open.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  HoustonAvatar,
} from "@houston-ai/core";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAgentProvisioningStore } from "../../stores/agent-provisioning";
import { useUIStore } from "../../stores/ui";

export function AgentWarmingDialog() {
  const { t } = useTranslation(["shell", "common"]);
  const open = useUIStore((s) => s.agentWarmingNoticeOpen);
  const setOpen = useUIStore((s) => s.setAgentWarmingNoticeOpen);
  const anyWarming = useAgentProvisioningStore(
    (s) => Object.keys(s.provisioning).length > 0,
  );

  // The agent finished while the notice was up: the blocked action is
  // available again, so the notice has nothing left to say.
  useEffect(() => {
    if (open && !anyWarming) setOpen(false);
  }, [open, anyWarming, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <HoustonAvatar diameter={72} running />
          <div className="flex flex-col gap-2">
            <DialogTitle>{t("shell:agentProvisioning.title")}</DialogTitle>
            <DialogDescription>
              {t("shell:agentProvisioning.blockedBody")}
            </DialogDescription>
          </div>
          <Button className="min-w-28" onClick={() => setOpen(false)}>
            {t("common:actions.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
