import { CatalogAddButton, CatalogRow } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  type AppDisplay,
  AppLogo,
  type ConnectFlow,
  ConnectFlowInline,
} from "../integrations";

/**
 * One flat category row on the browse plane — the integrations flavor of the
 * shared {@link CatalogRow}: brand art via {@link AppLogo}, the app's name +
 * one-line description, and the ghost `+` install button at the right edge.
 * The row BODY opens the app's "more info" modal (`onOpen`); only the `+`
 * connects.
 *
 * The row OWNS its connect state. While THIS app connects the `+` spins and the
 * row expands underneath with the live phase ({@link ConnectFlowInline}: opening
 * the browser, then the waiting copy and its recovery actions, then the
 * outcome), so the feedback sits exactly where the user clicked. Every OTHER row
 * stays fully enabled at full strength: connects are per toolkit and concurrent,
 * so handing off Slack must never lock the user out of Notion.
 *
 * The catalog renders some apps twice (the "Most used" spotlight repeats
 * category rows), so only the copy that `owns` the flow expands; the duplicate
 * keeps the spinning `+` — one app, one panel, on the row that was pressed.
 */
export function PlaneAppRow({
  display,
  onOpen,
  onConnect,
  connectFlow,
  owns,
}: {
  display: AppDisplay;
  onOpen: () => void;
  onConnect: () => void;
  connectFlow: ConnectFlow;
  /** This row is the one copy of the app that shows the inline connect state. */
  owns: boolean;
}) {
  const { t } = useTranslation("integrations");
  const connecting = display.toolkit in connectFlow.states;
  return (
    <div>
      <CatalogRow
        icon={<AppLogo display={display} size="lg" className="rounded-lg" />}
        title={display.name}
        description={display.description}
        onClick={onOpen}
        action={
          <CatalogAddButton
            label={t("home.connectApp", { name: display.name })}
            busy={connecting}
            onClick={onConnect}
          />
        }
      />
      {/* Indented to the row's text column so the state reads as this row's. */}
      <ConnectFlowInline
        appName={display.name}
        className="mt-1 mb-2 ml-16 mr-3"
        connectFlow={connectFlow}
        toolkit={display.toolkit}
        owns={owns}
      />
    </div>
  );
}
