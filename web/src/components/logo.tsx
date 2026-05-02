import { cn } from "@/lib/utils";

export function Logo({
  size = "md",
  tag = "SCAN",
  className,
}: {
  size?: "md" | "lg";
  tag?: string | null;
  className?: string;
}) {
  const big = size === "lg";
  return (
    <span className={cn("logo", big && "logo--lg", className)}>
      <span className="logo__mark">
        <svg
          viewBox="0 0 24 24"
          width={big ? 22 : 18}
          height={big ? 22 : 18}
          aria-hidden="true"
        >
          <path
            d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M12 7 L17 9.5 L17 14.5 L12 17 L7 14.5 L7 9.5 Z"
            fill="var(--accent)"
            opacity="0.18"
          />
          <circle cx="12" cy="12" r="1.8" fill="var(--accent)" />
        </svg>
      </span>
      <span className="logo__word">
        <span style={{ color: "var(--accent)" }}>o</span>xid
      </span>
      {tag ? <span className="logo__tag">{tag}</span> : null}
    </span>
  );
}
