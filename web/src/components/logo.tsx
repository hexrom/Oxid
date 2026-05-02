import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-mono text-lg tracking-tight text-text",
        className,
      )}
    >
      <span className="text-oxide">o</span>
      <span>xid</span>
      <span className="ml-1 text-[10px] uppercase tracking-[0.2em] text-muted">
        web
      </span>
    </span>
  );
}
