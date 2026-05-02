"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

export function DisconnectButton({ username }: { username: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function disconnect() {
    if (!window.confirm(`Disconnect GitLab (@${username})?`)) return;
    setPending(true);
    try {
      await fetch("/api/auth/disconnect", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={disconnect}
      disabled={pending}
      className="btn-ghost text-xs"
    >
      {pending ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <LogOut size={12} />
      )}
      Disconnect
    </button>
  );
}
