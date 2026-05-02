import { LayoutDashboard, FolderGit2 } from "lucide-react";

import { Logo } from "@/components/logo";
import { DisconnectButton } from "@/components/disconnect-button";
import { SidebarNavItem } from "@/components/sidebar-nav-item";

export function PageShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const initial = (username[0] ?? "?").toLowerCase();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__logo">
          <Logo />
        </div>
        <nav className="sidebar__nav">
          <SidebarNavItem href="/dashboard" icon={<LayoutDashboard size={14} />}>
            Overview
          </SidebarNavItem>
          <SidebarNavItem href="/projects" icon={<FolderGit2 size={14} />}>
            Projects
          </SidebarNavItem>
        </nav>
        <div className="sidebar__user sidebar__quick">
          <div className="user-chip">
            <div className="user-chip__avatar">{initial}</div>
            <div>
              <div className="user-chip__name">@{username}</div>
              <div className="user-chip__org">gitlab.com</div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <DisconnectButton username={username} />
          </div>
        </div>
      </aside>
      <main className="content animate-fadeIn">{children}</main>
    </div>
  );
}
