import { cn } from "@houston-ai/core";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { isAgentContextId } from "../../lib/agent-role-catalog";
import {
  ONBOARDING_INDUSTRY_SOMETHING_ELSE,
  type OnboardingIndustry,
} from "../../lib/onboarding-survey";
import { ChoiceSearchRow } from "../shell/choice-row";
import { ChoiceRuns } from "../shell/choice-runs";
import {
  choiceSearchEmptyState,
  enterAction,
  rovingChipId,
} from "../shell/choice-step-model";
import {
  CONTEXT_SEARCH_REACH,
  contextRunsForQuery,
} from "../shell/context-step-model";
import {
  useChipGrid,
  useEscapeWithin,
  useLeaveWithFocus,
  useTypeToSearch,
} from "../shell/use-choice-keyboard";
import { SurveyIndustryNoMatches } from "./survey-industry-no-matches";
import { SurveyIndustryOther } from "./survey-industry-other";

/**
 * The industry question, asked from the hire catalog's own contexts so the
 * answer is the one the create flow starts an AI Employee from. The same
 * pieces as the create flow's industry step (the filter paired with the door
 * out, one sorted run of chips, typing anywhere filtering it), laid out for
 * the survey card: a pick SELECTS and the survey's Continue confirms, because
 * the survey saves every answer before it advances.
 *
 * The chips live in a bounded, scrolling well: fifty industries in the card's
 * own scroll would push Continue a phone's height below the pick.
 */
export function SurveyIndustryPicker({
  question,
  industry,
  otherText,
  disabled,
  errorId,
  onIndustry,
  onOther,
  onLeaveOther,
}: {
  /** The question, which is what the chips' radio group is named for. */
  question: string;
  industry: OnboardingIndustry | null;
  otherText: string;
  disabled: boolean;
  errorId: string | null;
  onIndustry: (id: OnboardingIndustry) => void;
  onOther: (value: string) => void;
  onLeaveOther: () => void;
}) {
  const { t } = useTranslation("agentOnboarding");
  const [query, setQuery] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const customRef = useRef<HTMLButtonElement>(null);
  const grid = useChipGrid();
  const custom = industry === ONBOARDING_INDUSTRY_SOMETHING_ELSE;

  const runsFor = useCallback(
    (value: string) =>
      contextRunsForQuery(value, (id) => t(`roleSetup.contexts.${id}`)),
    [t],
  );
  const runs = runsFor(query);
  const emptyState = choiceSearchEmptyState(runs, query);
  const selectedId = custom ? null : industry;
  const rovingId = rovingChipId(runs, selectedId, focusedId);

  // A resumed question (Back, or a re-opened survey) opens on its answer,
  // which may sit below the well's fold.
  useEffect(() => {
    grid.ref.current
      ?.querySelector('[aria-checked="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [grid.ref]);

  useTypeToSearch(pickerRef, !custom && !disabled, (character) => {
    setQuery((current) => current + character);
    searchRef.current?.focus();
  });

  // The words already typed into the filter ARE the answer the user is
  // giving: taking the door carries them rather than asking for them twice.
  // They leave the filter as they go, so the chips behind the typed answer,
  // and the list "Back to the list" returns to, are whole.
  const takeWords = (words: string) => {
    onIndustry(ONBOARDING_INDUSTRY_SOMETHING_ELSE);
    if (words) onOther(words);
    setQuery("");
  };
  const pick = (id: string) => {
    // The run renders catalog ids alone, so this only ever narrows.
    if (isAgentContextId(id)) onIndustry(id);
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // An IME's Enter confirms the characters being composed; it answers nothing.
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const action = enterAction(runs, query);
    if (action.kind === "none") return;
    event.preventDefault();
    if (action.kind === "pick") pick(action.id);
    else takeWords(emptyState.query);
  };

  const leaveCustom = useLeaveWithFocus(custom, customRef, onLeaveOther);
  useEscapeWithin(pickerRef, () => {
    if (custom) {
      leaveCustom();
      return true;
    }
    if (query === "") return false;
    setQuery("");
    return true;
  });

  return (
    <div
      ref={pickerRef}
      className="flex w-full max-w-xl flex-col gap-4 text-left"
    >
      {custom ? (
        <SurveyIndustryOther
          value={otherText}
          disabled={disabled}
          errorId={errorId}
          onChange={onOther}
          onLeave={leaveCustom}
        />
      ) : (
        <div inert={disabled}>
          <ChoiceSearchRow
            search={{
              placeholder: t("roleSetup.contextSearch"),
              reach: CONTEXT_SEARCH_REACH,
              runsFor,
              noMatchesLabel: t("roleSetup.noContextMatches"),
              queryAnswerLabel: (words) =>
                t("roleSetup.useQueryAsContext", { query: words }),
              onUseQuery: takeWords,
            }}
            query={query}
            searchRef={searchRef}
            customLabel={t("roleSetup.somethingElse")}
            customRef={customRef}
            onQueryChange={setQuery}
            onSearchKeyDown={onSearchKeyDown}
            onSelectCustom={() => takeWords(query.trim())}
          />
        </div>
      )}

      {/* The chips stay behind a typed answer, dimmed, as the context the
          question was asked in; nothing in them is reachable until the row
          hands the question back. */}
      <div
        inert={custom || disabled}
        className={cn(
          "-mx-1 max-h-[40dvh] overflow-y-auto px-1 py-1 transition-opacity duration-200 md:max-h-64",
          custom && "opacity-50",
        )}
      >
        {emptyState.empty && (
          <SurveyIndustryNoMatches
            query={emptyState.query}
            onUseQuery={() => takeWords(emptyState.query)}
          />
        )}
        <ChoiceRuns
          gridRef={grid.ref}
          headline={question}
          keyboardHint={t("roleSetup.chipsKeyboardHint")}
          runs={runs}
          selectedId={selectedId}
          rovingId={rovingId}
          onSelect={pick}
          onKeyDown={grid.onKeyDown}
          onChipFocus={setFocusedId}
        />
      </div>
    </div>
  );
}
