import { cn } from "../utils";

interface Props {
  src: string;
  alt?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: "size-4",
  md: "size-7",
  lg: "size-12",
};

export function AgentAvatar({ src, alt = "", size = "md", className }: Props) {
  const s = SIZES[size];
  return (
    <img
      src={src}
      alt={alt}
      className={cn("rounded-full shrink-0", s, className)}
    />
  );
}
