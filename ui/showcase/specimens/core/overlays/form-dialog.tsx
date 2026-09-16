import { Input } from "@houston-ai/core";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { Form, sleep } from "./form-dialog-demo";
import { formDialogProps } from "./form-dialog-parts";

function FormDialogSpecimen() {
  return (
    <SpecimenPage
      title="FormDialog"
      intro="ConfirmDialog's frame, with fields in the middle. One width, one header, one footer — a form dialog has nothing left to assemble."
    >
      <SpecimenSection
        title="Sizes"
        note="Two, no third. Both cap at `sm:` so the phone keeps the dialog's gutter; anything wider than `md` is a flow and belongs in FlowSheet."
      >
        <SpecimenRow label="sm — one field">
          <Form
            label="Rename agent"
            size="sm"
            title="Rename agent"
            primary={{ label: "Save name" }}
          />
        </SpecimenRow>
        <SpecimenRow label="md (default) — a short form">
          <Form
            label="New routine"
            title="New routine"
            description="Inbox Zero runs it on the schedule you set here."
            primary={{ label: "Create routine" }}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="The primary"
        note="The primary is the form's submit button, so Enter in any single-line field runs it. A handler that returns a promise keeps the dialog open with a spinner, refuses the second click, and closes when the work lands. Two outcomes keep it on screen: a rejection (that failed, the input survives) and a resolution of false (that worked, and there is one more thing to show)."
      >
        <SpecimenRow label="Async — resolves">
          <Form
            label="Save name"
            buttonVariant="default"
            title="Rename agent"
            description="The name is what people see in the rail and in chat."
            primary={{
              label: "Save name",
              pendingLabel: "Saving",
              onClick: () => sleep(1200),
            }}
          />
        </SpecimenRow>
        <SpecimenRow label="Async — rejects, stays open">
          <Form
            label="Save a name that is taken"
            title="Rename agent"
            description="Try it: the dialog stays, so the typing survives."
            primary={{
              label: "Save name",
              pendingLabel: "Saving",
              onClick: async () => {
                await sleep(900);
                throw new Error("That name is already taken");
              },
            }}
          />
        </SpecimenRow>
        <SpecimenRow label="Async — resolves false, stays open">
          <Form
            label="Mint an API key"
            title="New API key"
            description="It succeeds and the dialog stays: a secret is shown once."
            primary={{
              label: "Create key",
              pendingLabel: "Minting",
              onClick: () => sleep(900).then(() => false),
            }}
          />
        </SpecimenRow>
        <SpecimenRow label="Destructive">
          <Form
            label="Leave the space"
            title="Leave Acme?"
            description="You lose access to its agents until someone invites you back."
            primary={{ label: "Leave space", variant: "destructive" }}
          />
        </SpecimenRow>
        <SpecimenRow label="Disabled — nothing typed yet">
          <Form
            label="Invite a teammate"
            title="Invite a teammate"
            primary={{ label: "Send invite", disabled: true }}
          >
            <Input placeholder="name@company.com" aria-label="Email" />
          </Form>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="The secondary"
        note="A secondary WITHOUT onClick closes the dialog — the Cancel every form needs. WITH one, that handler owns what happens and nothing closes, so a Back can walk the caller's own steps. null renders none at all: the reveal posture, where the work already happened and there is nothing left to cancel."
      >
        <SpecimenRow label="Default Cancel">
          <Form
            label="Rename agent"
            title="Rename agent"
            primary={{ label: "Save name" }}
          />
        </SpecimenRow>
        <SpecimenRow label="Custom label, localized">
          <Form
            label="Renombrar agente"
            title="Renombrar agente"
            description="El nombre es lo que se ve en la barra lateral."
            primary={{ label: "Guardar" }}
            labels={{ cancel: "Cancelar", close: "Cerrar" }}
          />
        </SpecimenRow>
        <SpecimenRow label="Its own handler">
          <Form
            label="Disconnect Gmail"
            title="Disconnect Gmail?"
            description="Inbox Zero stops triaging until you reconnect it."
            primary={{ label: "Disconnect", variant: "destructive" }}
            secondary={{ label: "Keep connected" }}
          />
        </SpecimenRow>
        <SpecimenRow label="None — the reveal's one way out">
          <Form
            label="Reveal a minted key"
            title="Your API key"
            description="Copy it now. It is shown once and never shown again."
            primary={{ label: "Done" }}
            secondary={null}
          >
            <code className="rounded-lg border border-line bg-input px-3 py-2 font-mono text-ink text-xs">
              hk_live_9f2c4a7e1b
            </code>
          </Form>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={formDialogProps} />
      <SpecimenTokens
        classes={["bg-dialog", "bg-black/25", "text-ink-muted", "bg-action"]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["FormDialog"];

export const specimen: Specimen = {
  id: "core-form-dialog",
  title: "FormDialog",
  group: "Overlays",
  render: () => <FormDialogSpecimen />,
};
