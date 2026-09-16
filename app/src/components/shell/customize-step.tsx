import { AgentBriefRecap } from "./agent-brief-recap";
import { AgentIdentityForm } from "./agent-identity-form";
import type { RecapSegmentId } from "./create-step-recap";
import type { CreateAgentFlow } from "./use-create-agent-flow";

/**
 * Step 3 of the guided setup: a name and a colour, and nothing else. The two
 * answers behind it are already made, so the screen states them as two chips
 * rather than asking again; each chip is also the way back to its question.
 *
 * The composition centres on one axis: face, answers, palette and name all
 * share it. This screen collects one short thing, so it is a standing portrait
 * in the compact frame rather than a form pinned to a left rail like the two
 * questions before it, and what it asks for is the sheet's own title. On a
 * phone the column scrolls, which is what keeps the name field clear of the
 * keyboard; the action it submits is in the sheet's bottom bar either way.
 */
export function CustomizeStep({
  flow,
  formId,
  onChangeAnswer,
}: {
  flow: CreateAgentFlow;
  formId: string;
  /** Back to the question that collected an answer, from its own chip. */
  onChangeAnswer: (step: RecapSegmentId) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-sm">
      <AgentIdentityForm
        formId={formId}
        name={flow.name}
        color={flow.color}
        error={flow.error}
        existingPath={flow.existingPath}
        nameInvalid={flow.nameInvalid}
        showLinkProject={flow.showLinkProject}
        onNameChange={flow.onNameChange}
        onColorChange={flow.onColorChange}
        onExistingPathChange={flow.onExistingPathChange}
        onSubmit={flow.onSubmit}
        header={
          <AgentBriefRecap
            answers={{
              context: flow.roleState.contextLabel,
              role: flow.roleState.roleLabel,
            }}
            onChange={onChangeAnswer}
          />
        }
      />
    </div>
  );
}
