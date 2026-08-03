/**
 * The composer's "no AI model connected" state: what stands where the chat
 * input normally is, until the user connects a provider.
 *
 * It sits in the composer slot (`chat-panel.tsx` hides the whole `ChatInput`
 * while a `replace`-mode override is present), so it stays COMPACT — roughly
 * the height of the input it replaces, tighter padding than a full-pane empty
 * state, title at body size rather than the `Empty` default display size.
 *
 * The copy is the model picker's own no-providers copy (`noProviders.*`): the
 * two surfaces tell the user the same thing about the same fact, so they say it
 * in the same words. `onConnect` is withheld for a viewer who cannot open the AI
 * Hub, which renders the story with no button rather than a dead end.
 */

import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@houston-ai/core";
import { PlugZapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PickerEmptyState } from "./chat-model-selector-labels.ts";

interface ChatConnectAiEmptyStateProps {
  /** Which no-providers story to tell: personal space or team space. */
  variant: PickerEmptyState;
  /** Opens the AI Hub. Omitted when the viewer cannot reach it. */
  onConnect?: () => void;
}

export function ChatConnectAiEmptyState({
  variant,
  onConnect,
}: ChatConnectAiEmptyStateProps) {
  const { t } = useTranslation("chat");
  return (
    <Empty className="border-0 gap-4 p-4 md:p-4">
      <EmptyHeader className="gap-1.5">
        <EmptyMedia variant="icon">
          <PlugZapIcon />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium">
          {t(`modelSelector.picker.noProviders.${variant}.title`)}
        </EmptyTitle>
        <EmptyDescription>
          {t(`modelSelector.picker.noProviders.${variant}.hint`)}
        </EmptyDescription>
      </EmptyHeader>
      {onConnect ? (
        <EmptyContent>
          <Button
            className="rounded-full"
            size="sm"
            variant="outline"
            onClick={onConnect}
          >
            {t("modelSelector.picker.noProviders.action")}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
