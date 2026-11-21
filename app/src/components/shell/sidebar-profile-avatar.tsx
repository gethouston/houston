import { initialsFor } from "@houston-ai/board";
import { Avatar, AvatarFallback, AvatarImage } from "@houston-ai/core";
import { useSidebarAvatarDiameter } from "@houston-ai/layout";
import { UserRound } from "lucide-react";

export function SidebarProfileAvatar(props: {
  name: string | null;
  avatarUrl: string | null;
}) {
  const diameter = useSidebarAvatarDiameter();
  return (
    <Avatar style={{ width: diameter, height: diameter }}>
      {props.avatarUrl && (
        <AvatarImage
          src={props.avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
        />
      )}
      <AvatarFallback className="text-xs font-medium">
        {props.name ? (
          initialsFor(props.name)
        ) : (
          <UserRound className="size-4" aria-hidden="true" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
