import type { ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./resizable";

export interface SplitViewProps {
  left: ReactNode;
  right: ReactNode;
  defaultLeftSize?: number;
  defaultRightSize?: number;
  minLeftSize?: number;
  minRightSize?: number;
}

export function SplitView({
  left,
  right,
  defaultLeftSize = 55,
  defaultRightSize = 45,
  minLeftSize = 30,
  minRightSize = 25,
}: SplitViewProps) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel
        defaultSize={defaultLeftSize}
        minSize={minLeftSize}
        className="overflow-hidden"
      >
        {left}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel
        defaultSize={defaultRightSize}
        minSize={minRightSize}
        className="overflow-hidden"
      >
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
