import { AGENT_COLORS, resolveAgentColor } from "@houston-ai/core";
import type { ReactNode } from "react";
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
  employeeMetalSeed,
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
}: {
  color: string | undefined;
  role: string;
  name: ReactNode;
  brief: ReactNode;
  status: EmployeeCardStatus;
  message: EmployeeCardMessage;
  recovery?: EmployeeCardRecovery;
  onColorChange: (color: string) => void;
}) {
  const paint = resolveAgentColor(color);
  const seed = employeeMetalSeed(
    employeeEngravingColor(color, AGENT_COLORS),
    employeeEngravingRole(role, EMPLOYEE_ROLE_INDEX),
  );
  return (
    <div className="@container relative isolate grid w-full min-w-0 rounded-2xl bg-card-solid text-left text-ink ht-hairline">
      <EmployeeCardPaint paint={paint} />
      {/* DOM order keeps name → dice → color → role → industry without positive tabindex. */}
      <div className="relative row-start-2 flex min-w-0 flex-col gap-1 px-5 pt-5">
        {name}
        <p
          id={message.id}
          aria-live="polite"
          className="text-xs text-danger empty:hidden"
        >
          {message.text}
        </p>
      </div>
      <div className="relative row-start-1 h-40 border-b border-line">
        <EmployeeCardMetal
          paint={paint}
          seed={seed}
          dim={status === "joining"}
        />
        <EmployeeColorPicker color={color} onColorChange={onColorChange} />
      </div>
      <div className="relative row-start-3 flex min-w-0 flex-col gap-2 px-5 pt-3 pb-5">
        {brief}
      </div>
      {status !== "draft" && (
        <div className="relative row-start-4 px-5 pb-4">
          <EmployeeCardFoot status={status} recovery={recovery} />
        </div>
      )}
    </div>
  );
}
