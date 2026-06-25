export function AmazonBedrockLogo({
  className = "h-5 w-5",
}: {
  className?: string;
} = {}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 16.5 12 21l8-4.5" />
      <path d="M4 11.8 12 16l8-4.2" />
      <path d="M12 3 4 7.5l8 4.5 8-4.5L12 3Z" />
    </svg>
  );
}
