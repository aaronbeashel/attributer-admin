"use client";

import { usePathname } from "next/navigation";
import {
  HomeLine,
  Users01,
  File06,
  BarChartSquare02,
  ShieldTick,
  Settings01,
  HelpCircle,
} from "@untitledui/icons";
import { SidebarNavigationSimple } from "@/components/application/app-navigation/sidebar-navigation/sidebar-simple";
import type { NavItemType } from "@/components/application/app-navigation/config";
import { GlobalSearch } from "./_components/global-search";

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
    label: "Analytics",
    icon: BarChartSquare02,
    items: [
      { label: "Snapshot", href: "/analytics/snapshot" },
      { label: "Pipeline", href: "/analytics/pipeline" },
    ],
  },
  {
    label: "Licensing",
    href: "/licensing",
    icon: ShieldTick,
  },
];

const footerItems: NavItemType[] = [
  {
    label: "Support",
    href: "#",
    icon: HelpCircle,
  },
  {
    label: "Settings",
    href: "#",
    icon: Settings01,
  },
];

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
        showAccountCard={true}
      />
      <main className="flex-1 overflow-auto">
        <div className="border-b border-secondary bg-primary px-4 py-3 lg:px-8">
          <GlobalSearch />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
