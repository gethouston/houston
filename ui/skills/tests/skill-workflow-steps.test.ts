import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SkillWorkflowSteps } from "../src/skill-workflow-steps.tsx";
import type { SkillWorkflowStepItem } from "../src/types.ts";

const steps: SkillWorkflowStepItem[] = [
  {
    title: "Read the playbook",
    detail: "Load the sales context first.",
    integration: null,
  },
  { title: "Draft the brief", detail: null, integration: null },
];

const render = (props: Parameters<typeof SkillWorkflowSteps>[0]) =>
  renderToStaticMarkup(React.createElement(SkillWorkflowSteps, props));

describe("SkillWorkflowSteps", () => {
  it("numbers every step and shows its title", () => {
    const html = render({ steps });
    assert.match(html, />1</);
    assert.match(html, />2</);
    assert.match(html, />Read the playbook</);
    assert.match(html, />Draft the brief</);
  });

  it("shows a step's detail only when it has one", () => {
    const html = render({ steps });
    assert.match(html, />Load the sales context first.</);
    // Two steps, one detail: the second step renders a title and nothing else.
    assert.equal(html.split("text-ink-muted leading-relaxed").length - 1, 1);
  });

  it("keeps the detail's own line breaks", () => {
    const html = render({
      steps: [{ title: "Collect", detail: "• One\n• Two", integration: null }],
    });
    assert.match(html, /whitespace-pre-line/);
    assert.match(html, /• One\n• Two/);
  });

  it("heads the panel with the English default until a label is passed", () => {
    assert.match(render({ steps }), />Workflow</);
    assert.match(
      render({ steps, labels: { heading: "Cómo trabajo" } }),
      />Cómo trabajo</,
    );
  });

  it("renders nothing at all for a skill with no parsed steps", () => {
    assert.equal(render({ steps: [] }), "");
  });

  it("wraps long titles instead of scrolling the panel sideways", () => {
    const html = render({
      steps: [
        {
          title: "A very long step title ".repeat(5),
          detail: null,
          integration: null,
        },
      ],
    });
    assert.match(html, /break-words/);
    assert.doesNotMatch(html, /overflow-x/);
  });
});

const sendEmail: SkillWorkflowStepItem = {
  title: "Send the recap",
  detail: null,
  integration: { toolkit: "gmail", action: "GMAIL_SEND_EMAIL" },
};

describe("SkillWorkflowSteps integrations", () => {
  it("chips the app and its action beside the step's title", () => {
    const html = render({ steps: [sendEmail] });
    assert.match(html, /gmail · Send email/);
    assert.match(html, /text-chip-text/);
  });

  it("chips the app alone when the step named no action", () => {
    const html = render({
      steps: [
        { ...sendEmail, integration: { toolkit: "slack", action: null } },
      ],
    });
    assert.match(html, />slack</);
  });

  it("chips nothing for a step that touches no app", () => {
    assert.doesNotMatch(render({ steps }), /text-chip-text/);
  });

  it("hands the app off to renderIntegration when one is given", () => {
    const html = render({
      steps: [sendEmail],
      renderIntegration: (integration) =>
        React.createElement(
          "span",
          { "data-app": integration.toolkit },
          integration.action,
        ),
    });
    assert.match(html, /data-app="gmail"/);
    assert.match(html, />GMAIL_SEND_EMAIL</);
    // The fallback chip stands down entirely — no double render.
    assert.doesNotMatch(html, /gmail · Send email/);
  });

  it("lets the chip wrap under a title that fills the row", () => {
    const html = render({ steps: [sendEmail] });
    assert.match(html, /flex-wrap/);
    assert.doesNotMatch(html, /overflow-x/);
  });
});
