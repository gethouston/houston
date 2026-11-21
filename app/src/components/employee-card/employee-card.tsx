import {
  AGENT_COLORS,
  Button,
  metalEngravingSeed,
  resolveAgentColor,
} from "@houston-ai/core";
import { Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  EmployeeCardFoot,
  type EmployeeCardRecovery,
} from "./employee-card-foot";
import { EmployeeCardMetal } from "./employee-card-metal";
import type { EmployeeCardStatus } from "./employee-card-model";
import { EmployeeCardPaint } from "./employee-card-paint";
import { EmployeeColorPicker } from "./employee-color-picker";
import {
  employeeEngravingColor,
  employeeEngravingRole,
} from "./employee-metal-pattern";
import { EMPLOYEE_ROLE_INDEX } from "./employee-role-index";

export interface EmployeeCardMessage {
  id: string;
  text: string | null;
}

export function EmployeeCard({
  color,
  role,
  name,
  brief,
  status,
  message,
  recovery,
  onColorChange,
  remove,
}: {
  color: string | undefined;
  role: string;
  name: ReactNode;
  brief: ReactNode;
  status: EmployeeCardStatus;
  message: EmployeeCardMessage;
  recovery?: EmployeeCardRecovery;
  onColorChange: (color: string) => void;
  remove?: { name: string; onRemove: () => void };
}) {
  const { t } = useTranslation("shell");
  const paint = resolveAgentColor(color);
  const seed = metalEngravingSeed(
    employeeEngravingColor(color, AGENT_COLORS),
    employeeEngravingRole(role, EMPLOYEE_ROLE_INDEX),
  );
  return (
    <div className="@container relative isolate flex w-full min-w-0 rounded-2xl bg-card-solid text-left text-ink ht-hairline">
      <EmployeeCardPaint paint={paint} />
      <div className="relative w-18 shrink-0 border-r border-line @xs:w-26">
        <EmployeeCardMetal
          paint={paint}
          seed={seed}
          dim={status === "joining"}
        />
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">{name}</div>
          {remove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 text-ink-muted md:size-9"
              aria-label={t("employeeCard.removeLabel", { name: remove.name })}
              onClick={remove.onRemove}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          )}
        </div>
        <p
          id={message.id}
          aria-live="polite"
          className="px-3 text-xs text-danger-ink empty:hidden"
        >
          {message.text}
        </p>
        <div className="grid gap-0.5 @2xl:grid-cols-3 @2xl:gap-2">
          {brief}
          <EmployeeColorPicker color={color} onColorChange={onColorChange} />
        </div>
        {status !== "draft" && (
          <div className="px-3 pt-1">
            <EmployeeCardFoot status={status} recovery={recovery} />
          </div>
        )}
      </div>
    </div>
  );
}
