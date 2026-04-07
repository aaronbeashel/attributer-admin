"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import {
  HomeLine,
  Users01,
  File06,
  ShieldTick,
} from "@untitledui/icons";
import { SidebarNavigationSimple } from "@/components/application/app-navigation/sidebar-navigation/sidebar-simple";
import type { NavItemType } from "@/components/application/app-navigation/config";

const navItems: NavItemType[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: HomeLine,
  },
  {
    label: "Accounts",
    href: "/accounts",
    icon: Users01,
  },
  {
    label: "Logs",
    href: "/logs",
    icon: File06,
  },
  {
    label: "Licensing",
    href: "/licensing",
    icon: ShieldTick,
  },
];

const footerItems: NavItemType[] = [];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <SidebarNavigationSimple
        activeUrl={pathname}
        items={navItems}
        footerItems={footerItems}
        showAccountCard={false}
      />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
}
