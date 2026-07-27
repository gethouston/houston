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

/**
 * One flat category row on the browse plane — the integrations flavor of the
 * shared {@link CatalogRow}: brand art via {@link AppLogo}, the app's name +
 * one-line description, and the ghost `+` install button at the right edge.
 * The row BODY opens the app's "more info" modal (`onOpen`); only the `+`
 * connects.
 *
 * The row OWNS its connect state, and while it does it stops being a flat row:
 * the header and the live flow ({@link ConnectFlowInline}) are enclosed by ONE
 * card, so the hand-off reads as this app's own surface rather than a panel
 * floating loose underneath it. The card carries exactly one spinner — the `+`
 * slot's, where the user just clicked — so the flow copy below adds words, not
 * a second thing turning. Every OTHER row stays fully enabled at full strength:
 * connects are per toolkit and concurrent, so handing off Slack must never lock
 * the user out of Notion.
 *
 * The catalog renders some apps twice (the "Most used" spotlight repeats
 * category rows), so only the copy that `owns` the flow becomes a card; the
 * duplicate stays a flat row with its compact spinning `+` — one app, one card,
 * on the row that was pressed.
 *
 * At rest nothing about the row changes: the card's border and fill live on
 * their own layer behind the row, transparent until the flow starts, so the
 * catalog keeps its flat transparent-row language and the treatment can
 * cross-fade on opacity alone.
 *
 * An app whose connection never landed keeps this exact row, in this exact
 * section — a broken connection lives where the app lives. It swaps its blurb
 * for a `status` line ("Finishing up" / "Needs reconnecting", the shared
 * dot-and-label treatment) and its `+` retries the connect from HERE. A live
 * flow outranks that line everywhere: while one is running the row is reporting
 * it, so repeating the at-rest status beside it would be the same news twice.
 */
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
  /** This row is the one copy of the app that shows the inline connect state. */
  owns: boolean;
  /** This app holds a pending / errored connection: the row wears its status
   *  instead of its description. Absent = a plain connectable app. */
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
          // Square bottom while carded: the hover fill then stops on a straight
          // line that reads as the card's header divider, never as a stray
          // rounded box floating mid-card.
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
              // The button's default hover fill IS the card's own surface, so
              // inside the card it would hover into nothing.
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
            // The row's own rhythm continued: 12px side gutters (its `px-3`)
            // and the 10px it already leaves under itself, so the card's
            // padding is even top to bottom.
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
