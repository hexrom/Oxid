import Link from "next/link";

import { Logo } from "@/components/logo";
import { DisconnectButton } from "@/components/disconnect-button";

export function PageShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/projects" className="focus-ring">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="rounded border border-border bg-surface px-2 py-1 font-mono text-xs text-textDim">
              @{username}
            </span>
            <DisconnectButton username={username} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 animate-fadeIn">
        {children}
      </main>
    </div>
  );
}
