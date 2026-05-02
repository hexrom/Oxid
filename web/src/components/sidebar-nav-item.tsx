"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function SidebarNavItem({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link href={href} className={cn("nav-item", active && "is-active")}>
      {icon}
      <span>{children}</span>
    </Link>
  );
}
