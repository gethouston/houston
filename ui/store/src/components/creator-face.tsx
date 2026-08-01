import { Avatar, AvatarFallback, AvatarImage } from "@houston-ai/core";

export function creatorInitial(name: string, fallback = "?") {
  return name.trim().charAt(0).toUpperCase() || fallback;
}

export function CreatorFace({
  name,
  avatarUrl,
  className = "size-12",
}: {
  name: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {avatarUrl ? (
        <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback>{creatorInitial(name)}</AvatarFallback>
    </Avatar>
  );
}
