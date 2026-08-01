import {
  Badge,
  Button,
  CatalogDetailDialog,
  CatalogRow,
} from "@houston-ai/core";
import type { ReactNode } from "react";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { DetailCapabilities, detailProps } from "./catalog-detail-dialog-parts";
import {
  availableAgents,
  SampleIcon,
  type SampleItem,
  sampleApp,
} from "./sample";

const [expense, standup] = availableAgents;

/**
 * A live trigger for every example: the same {@link CatalogRow} body click that
 * opens the modal in the product. Click a row.
 */
function DetailDemo({
  item,
  tags,
  description,
  action,
  children,
}: {
  item: SampleItem;
  tags?: ReactNode;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full max-w-md">
      <CatalogRow
        icon={<SampleIcon icon={item.icon} />}
        title={item.title}
        description={item.description}
        onClick={() => setOpen(true)}
      />
      <CatalogDetailDialog
        open={open}
        onOpenChange={setOpen}
        icon={<SampleIcon icon={item.icon} />}
        title={item.title}
        tags={tags}
        description={description}
        action={action}
      >
        {children}
      </CatalogDetailDialog>
    </div>
  );
}

function CatalogDetailDialogSpecimen() {
  return (
    <SpecimenPage
      title="Catalog detail dialog"
      intro="What a catalog row's body click opens: the item's art and name, its full untruncated description, anything extra, and the install CTA in the footer. It paints on the shared Dialog surface."
    >
      <SpecimenSection
        title="Variants"
        note="No style variants — every slot but icon and title is optional, so the modal is as small as the item deserves."
      >
        <SpecimenRow label="Full">
          <DetailDemo
            item={expense}
            tags={
              <>
                <Badge variant="secondary">Finance</Badge>
                <Badge variant="outline">by @julian</Badge>
              </>
            }
            description="Reads receipts from your inbox, files them by project, and hands you a monthly summary you can send straight to your accountant. It asks before spending anything and never files a receipt twice."
            action={<Button>Install</Button>}
          >
            <DetailCapabilities />
          </DetailDemo>
        </SpecimenRow>
        <SpecimenRow label="Title only">
          <DetailDemo item={standup} />
        </SpecimenRow>
        <SpecimenRow label="With tags">
          <DetailDemo
            item={standup}
            tags={<Badge variant="secondary">Team</Badge>}
            description="Posts yesterday's progress to the team every morning, pulled from what your agents actually did."
            action={<Button>Install</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="No action — read only">
          <DetailDemo
            item={sampleApp}
            tags={<Badge variant="outline">Connected</Badge>}
            description="Read and send mail on your behalf. Connected by @julian, used by Inbox Zero and Support Triage."
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Open and close from the row, the close button, Escape, or a click outside."
      >
        <SpecimenRow label="Closed at rest">
          <DetailDemo
            item={expense}
            description="Reads receipts from your inbox and files them by project."
            action={<Button>Install</Button>}
          />
        </SpecimenRow>
        <SpecimenRow label="Installing">
          <DetailDemo
            item={standup}
            description="Posts yesterday's progress to the team every morning."
            action={
              <Button disabled aria-busy="true">
                Installing
              </Button>
            }
          />
        </SpecimenRow>
        <SpecimenRow label="Already installed">
          <DetailDemo
            item={standup}
            tags={<Badge variant="secondary">Team</Badge>}
            description="Posts yesterday's progress to the team every morning."
            action={<Button variant="secondary">Open</Button>}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={detailProps} />

      <SpecimenTokens
        classes={[
          "bg-dialog",
          "border-line/50",
          "bg-black/25",
          "text-ink-muted",
        ]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["CatalogDetailDialog"];

export const specimen: Specimen = {
  id: "core-catalog-detail-dialog",
  title: "Catalog detail dialog",
  group: "Catalog",
  render: () => <CatalogDetailDialogSpecimen />,
};
