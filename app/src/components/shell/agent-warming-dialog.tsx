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
  const anyStalled = useAgentProvisioningStore((s) =>
    Object.values(s.provisioning).some((entry) => entry.timedOut),
  );

  useEffect(() => {
    if (open && !anyWarming) setOpen(false);
  }, [open, anyWarming, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <HoustonAvatar diameter={72} running />
          <div className="flex flex-col gap-2">
            <DialogTitle>
              {t(
                anyStalled
                  ? "shell:agentProvisioning.stalledTitle"
                  : "shell:agentProvisioning.title",
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                anyStalled
                  ? "shell:agentProvisioning.stalledBody"
                  : "shell:agentProvisioning.blockedBody",
              )}
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
