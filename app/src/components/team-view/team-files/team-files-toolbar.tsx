import { FilesSearch } from "@houston-ai/agent";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown, FolderPlus, FolderUp, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../../lib/types";

export interface TeamFileActions {
  upload?: () => void;
  uploadFolder?: () => void;
  newFolder: () => void;
}

function ActionItems({ actions }: { actions: TeamFileActions }) {
  const { t } = useTranslation("agents");
  return (
    <>
      {actions.upload && (
        <DropdownMenuItem onSelect={actions.upload}>
          <Upload aria-hidden /> {t("files.uploadFiles")}
        </DropdownMenuItem>
      )}
      {actions.uploadFolder && (
        <DropdownMenuItem onSelect={actions.uploadFolder}>
          <FolderUp aria-hidden /> {t("files.uploadFolder")}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={actions.newFolder}>
        <FolderPlus aria-hidden /> {t("files.newFolder")}
      </DropdownMenuItem>
    </>
  );
}

export function TeamFilesToolbar({
  agents,
  actions,
  query,
  onQueryChange,
}: {
  agents: Agent[];
  actions: Map<string, TeamFileActions>;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useTranslation("agents");
  const direct = agents.length === 1 ? actions.get(agents[0].id) : null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <FilesSearch
        value={query}
        onChange={onQueryChange}
        placeholder={t("files.searchPlaceholder")}
        clearLabel={t("files.searchClear")}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="shrink-0 rounded-full">
            {t("files.newMenu")} <ChevronDown aria-hidden className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          // New-folder mounts an autofocused inline input; the menu's default
          // close behavior then RESTORES focus to this trigger a beat later,
          // blurring the input, whose blur-cancel kills the creation before
          // the user ever sees it. The menu's actions all move focus onward
          // (an input, a file picker), so the trigger never reclaims it.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {direct ? (
            <ActionItems actions={direct} />
          ) : (
            agents.map((agent) => {
              const target = actions.get(agent.id);
              return target ? (
                <DropdownMenuSub key={agent.id}>
                  <DropdownMenuSubTrigger>{agent.name}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <ActionItems actions={target} />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : null;
            })
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
