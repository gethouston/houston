import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AsyncButton, Input } from "@houston-ai/core";

import { useComposioConnect } from "../../../hooks/use-composio-connect";
import { useConnectedToolkits } from "../../../hooks/queries";
import { isToolkitConnected } from "../../composio-card-state";
import { SetupCard, OptionCard } from "../setup-card";

interface ConnectEmailMissionProps {
  eyebrow: string;
  onBack: () => void;
  /** Fires once the chosen email toolkit is connected. */
  onConnected: (toolkit: string, label: string) => void;
}

/**
 * Onboarding step 2: give the agent access to the user's email. Pick Gmail,
 * Outlook, or another provider and connect it through Composio (real OAuth, no
 * agent). We poll connected toolkits and hand off the moment it lands.
 */
export function ConnectEmailMission({
  eyebrow,
  onBack,
  onConnected,
}: ConnectEmailMissionProps) {
  const { t } = useTranslation("setup");
  const [sel, setSel] = useState<"gmail" | "outlook" | "other" | null>(null);
  const [other, setOther] = useState("");
  const { connect, connecting } = useComposioConnect();
  const { data: connectedToolkits } = useConnectedToolkits(true);
  const connectedSet = useMemo(
    () => new Set(connectedToolkits ?? []),
    [connectedToolkits],
  );

  const chosen =
    sel === "gmail"
      ? { toolkit: "gmail", label: "Gmail" }
      : sel === "outlook"
        ? { toolkit: "outlook", label: "Outlook" }
        : sel === "other" && other.trim()
          ? { toolkit: other.trim().toLowerCase(), label: other.trim() }
          : null;

  // Advance the moment the chosen toolkit shows up connected (the query
  // refetches when the window regains focus after the OAuth hop).
  useEffect(() => {
    if (chosen && isToolkitConnected(connectedSet, chosen.toolkit)) {
      onConnected(chosen.toolkit, chosen.label);
    }
  }, [chosen, connectedSet, onConnected]);

  const handleConnect = useCallback(() => {
    if (chosen) void connect(chosen.toolkit);
  }, [chosen, connect]);

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("tutorial.missions.connectEmail.title")}
      subtitle={t("tutorial.missions.connectEmail.body")}
      onBack={onBack}
      backLabel={t("tutorial.nav.back")}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="flex w-full max-w-sm flex-col gap-2">
          <OptionCard
            label="Gmail"
            selected={sel === "gmail"}
            onSelect={() => setSel("gmail")}
          />
          <OptionCard
            label="Outlook"
            selected={sel === "outlook"}
            onSelect={() => setSel("outlook")}
          />
          <OptionCard
            label={t("tutorial.missions.connectEmail.other")}
            selected={sel === "other"}
            onSelect={() => setSel("other")}
          />
          {sel === "other" && (
            <Input
              autoFocus
              value={other}
              placeholder={t("tutorial.missions.connectEmail.otherPlaceholder")}
              className="rounded-xl"
              onChange={(e) => setOther(e.target.value)}
            />
          )}
        </div>
        <AsyncButton
          className="h-11 rounded-full px-5"
          spinner={false}
          disabled={!chosen || connecting !== null}
          onClick={handleConnect}
        >
          {connecting
            ? t("tutorial.missions.connectEmail.connecting")
            : t("tutorial.missions.connectEmail.connect")}
        </AsyncButton>
      </div>
    </SetupCard>
  );
}
