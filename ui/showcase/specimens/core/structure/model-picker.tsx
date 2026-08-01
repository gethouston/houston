import {
  Button,
  ModelPicker,
  type ModelPickerModel,
  type ModelPickerProvider,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import { ChevronDown, Lock } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  longCatalog,
  modelPickerProps,
  modelPickerTokens,
  models,
  nothingConnected,
  onlyAnthropic,
  providers,
  stillChecking,
} from "./model-picker-parts";

/**
 * The picker lives in a popover — that is where its sizing, its focus handling
 * and its Escape/Backspace back-navigation are true, so every example here is a
 * real trigger: open it and drill in. Auto-focus is prevented both ways, as the
 * consumer contract requires, so the picker can place focus itself.
 */
function LivePicker({
  label,
  providers: providerList = providers,
  models: modelList = models,
  catalogState,
  withConnect = true,
  footer,
}: {
  label: string;
  providers?: ModelPickerProvider[];
  models?: ModelPickerModel[];
  catalogState?: "ready" | "loading";
  withConnect?: boolean;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(modelList[0]?.id);
  const [connecting, setConnecting] = useState(false);
  const selected = modelList.find((model) => model.id === selectedId);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            {selected?.name ?? label}
            <ChevronDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[320px] p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <ModelPicker
            models={modelList}
            providers={providerList}
            selectedId={selectedId}
            catalogState={catalogState}
            onSelect={(id) => {
              setSelectedId(id);
              setOpen(false);
            }}
            onConnectMore={
              withConnect
                ? () => {
                    setOpen(false);
                    setConnecting(true);
                  }
                : undefined
            }
            footer={footer}
          />
        </PopoverContent>
      </Popover>
      {connecting && (
        <span className="text-ink-muted text-[13px]">
          onConnectMore fired — the app opens its provider screen here.
        </span>
      )}
    </div>
  );
}

function ModelPickerSpecimen() {
  return (
    <SpecimenPage
      title="ModelPicker"
      intro="The two-level model dropdown behind the chat composer: connected providers first, one provider's models second."
    >
      <SpecimenSection
        title="Variants"
        note="No variant prop — the picker's shapes are its two levels and the affordances the props switch on. Open each trigger and drill in with ↑↓ / Enter; Escape or Backspace steps back."
      >
        <SpecimenRow label="Two levels">
          <LivePicker label="Claude Opus 4.5" />
        </SpecimenRow>
        <SpecimenRow label="One provider — straight to models">
          <LivePicker
            label="Anthropic only"
            providers={onlyAnthropic}
            models={models.filter((m) => m.providerId === "anthropic")}
          />
        </SpecimenRow>
        <SpecimenRow label="Long list — search appears past 8 rows">
          <LivePicker
            label="Nine models"
            providers={onlyAnthropic}
            models={longCatalog}
          />
        </SpecimenRow>
        <SpecimenRow label="With a policy footer">
          <LivePicker
            label="Workspace limited"
            footer={
              <span className="flex items-center gap-1.5">
                <Lock className="size-3 opacity-60" />4 models are turned off in
                your workspace
              </span>
            }
          />
        </SpecimenRow>
        <SpecimenRow label="No onConnectMore — no footer affordance">
          <LivePicker label="Read-only viewer" withConnect={false} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Level 1 never flashes an empty list while statuses resolve: loading and settled-empty are strict complements."
      >
        <SpecimenRow label="Ready">
          <LivePicker label="2 providers connected" />
        </SpecimenRow>
        <SpecimenRow label='catalogState="loading"'>
          <LivePicker
            label="Catalog loading"
            providers={[]}
            models={[]}
            catalogState="loading"
          />
        </SpecimenRow>
        <SpecimenRow label='connection="checking"'>
          <LivePicker
            label="Statuses resolving"
            providers={stillChecking}
            models={models}
          />
        </SpecimenRow>
        <SpecimenRow label="Nothing connected">
          <LivePicker
            label="New team space"
            providers={nothingConnected}
            models={[]}
          />
        </SpecimenRow>
        <SpecimenRow label="Nothing connected, no way to connect">
          <LivePicker
            label="Member view"
            providers={nothingConnected}
            models={[]}
            withConnect={false}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={modelPickerProps} />
      <SpecimenTokens classes={modelPickerTokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["ModelPicker"];

export const specimen: Specimen = {
  id: "core-model-picker",
  title: "ModelPicker",
  group: "Structure & nav",
  render: () => <ModelPickerSpecimen />,
};
