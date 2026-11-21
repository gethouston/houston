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
  variant: PickerEmptyState;
  onConnect?: () => void;
}

export function ChatConnectAiEmptyState({
  variant,
  onConnect,
}: ChatConnectAiEmptyStateProps) {
  const { t } = useTranslation("chat");
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PlugZapIcon />
        </EmptyMedia>
        <EmptyTitle>
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
