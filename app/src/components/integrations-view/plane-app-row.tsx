import { CatalogAddButton, CatalogRow } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  type AppDisplay,
  AppLogo,
  type BrokenStatus,
  type ConnectFlow,
  ConnectFlowInline,
  ConnectionStatusBadge,
  hasConnectState,
} from "../integrations";

export function PlaneAppRow({
  display,
  onOpen,
  onConnect,
  connectFlow,
  owns,
  status,
}: {
  display: AppDisplay;
  onOpen: () => void;
  onConnect: () => void;
  connectFlow: ConnectFlow;
  owns: boolean;
  status?: BrokenStatus;
}) {
  const { t } = useTranslation("integrations");
  const connecting = display.toolkit in connectFlow.states;
  const live = hasConnectState(connectFlow, display.toolkit);
  const carded = owns && live;
  return (
    <div className="relative">
      <span
        aria-hidden
        data-live={carded}
        className="connect-card-frame pointer-events-none absolute inset-0 rounded-xl border border-line bg-input"
      />
      <div className="relative">
        <CatalogRow
          className={carded ? "rounded-b-none" : undefined}
          icon={<AppLogo display={display} size="lg" className="rounded-lg" />}
          title={display.name}
          description={
            status && !live ? (
              <ConnectionStatusBadge status={status} />
            ) : (
              display.description
            )
          }
          onClick={onOpen}
          action={
            <CatalogAddButton
              className={carded ? "hover:bg-chip focus-visible:bg-chip" : ""}
              label={t("home.connectApp", { name: display.name })}
              busy={connecting}
              onClick={onConnect}
            />
          }
        />
        {carded && (
          <ConnectFlowInline
            appName={display.name}
            className="connect-card-body px-3 pt-0.5 pb-2.5"
            connectFlow={connectFlow}
            toolkit={display.toolkit}
            variant="bare"
          />
        )}
      </div>
    </div>
  );
}
