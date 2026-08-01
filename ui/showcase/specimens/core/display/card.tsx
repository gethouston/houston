import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@houston-ai/core";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { CARD_PROPS } from "./card-parts";

function CardSpecimen() {
  return (
    <SpecimenPage
      title="Card"
      intro="The container for one object — an agent, a run, a connection — and its seven slots."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop. A card's shape is which slots you compose; these are the four that exist in the product."
      >
        <SpecimenRow label="Header + content">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Inbox Zero</CardTitle>
              <CardDescription>
                Triages your mail every morning and drafts the replies you
                approve.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-ink-muted">
              Last run 8 minutes ago · 41 emails handled
            </CardContent>
          </Card>
        </SpecimenRow>
        <SpecimenRow label="With CardAction">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Meeting Notes</CardTitle>
              <CardDescription>
                Joins the call, writes the summary, files the follow-ups.
              </CardDescription>
              <CardAction>
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="text-sm text-ink-muted">
              Connected to Google Calendar
            </CardContent>
          </Card>
        </SpecimenRow>
        <SpecimenRow label="With CardFooter">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Weekly Report</CardTitle>
              <CardDescription>
                Pulls the numbers on Friday and writes the update for you.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-between">
              <span className="text-sm text-ink-muted">@julian</span>
              <Button size="sm">Hire</Button>
            </CardFooter>
          </Card>
        </SpecimenRow>
        <SpecimenRow label="Content only">
          <Card className="w-full max-w-sm">
            <CardContent className="text-sm text-ink">
              2.7k installs this month.
            </CardContent>
          </Card>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The card itself is inert — no hover, focus or disabled styling. Dividers are opt-in: add `border-b` to the header or `border-t` to the footer and the slot grows its own padding."
      >
        <SpecimenRow label="Divided header and footer">
          <Card className="w-full max-w-sm">
            <CardHeader className="border-b">
              <CardTitle>Expense Filer</CardTitle>
              <CardDescription>Files receipts as they land.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-ink-muted">
              14 receipts filed this week.
            </CardContent>
            <CardFooter className="border-t justify-end">
              <Button variant="ghost" size="sm">
                View runs
              </Button>
            </CardFooter>
          </Card>
        </SpecimenRow>
        <SpecimenRow label="Interactive (composed by the caller)">
          <Card className="w-full max-w-sm cursor-pointer transition-colors duration-150 ease-out hover:bg-card-hover">
            <CardHeader>
              <CardTitle>Standup Buddy</CardTitle>
              <CardDescription>
                Hover me — the interaction is a class the caller adds, not a
                prop.
              </CardDescription>
            </CardHeader>
          </Card>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size. Padding is fixed at 24px horizontally and vertically; width always comes from the parent."
      >
        <SpecimenRow label="Narrow / wide">
          <Card className="w-56">
            <CardHeader>
              <CardTitle>Contract Reader</CardTitle>
            </CardHeader>
          </Card>
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Contract Reader</CardTitle>
              <CardDescription>
                Reads the contract, flags the clauses that changed.
              </CardDescription>
            </CardHeader>
          </Card>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={CARD_PROPS} />

      <SpecimenTokens
        classes={["bg-card", "text-card-text", "text-ink-muted"]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "Card",
  "CardAction",
  "CardContent",
  "CardDescription",
  "CardFooter",
  "CardHeader",
  "CardTitle",
];

export const specimen: Specimen = {
  id: "core-card",
  title: "Card",
  group: "Data display",
  render: () => <CardSpecimen />,
};
