"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRole } from "@prisma/client";
import {
  CalendarDays,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  QrCode,
  Repeat2,
  Settings,
  Upload,
  Users,
  X
} from "lucide-react";
import { roleLabel } from "@/lib/access";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] },
  { href: "/admin/menu-builder", label: "Menu", icon: CalendarDays, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
  { href: "/admin/data-center", label: "Data Center", icon: Database, roles: [UserRole.EXECUTIVE_ADMIN] },
  { href: "/admin/campers", label: "Campers", icon: Users, roles: [UserRole.EXECUTIVE_ADMIN] },
  { href: "/admin/import/campers", label: "Camper Import", icon: Upload, roles: [UserRole.EXECUTIVE_ADMIN] },
  { href: "/admin/structure", label: "Structure", icon: Settings, roles: [UserRole.EXECUTIVE_ADMIN] },
  { href: "/admin/staff", label: "Staff", icon: Users, roles: [UserRole.EXECUTIVE_ADMIN] },
  { href: "/admin/import/staff", label: "Staff Import", icon: Upload, roles: [UserRole.EXECUTIVE_ADMIN] },
  { href: "/cards", label: "Cards", icon: QrCode, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
  { href: "/registration", label: "Register", icon: ClipboardCheck, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] },
  { href: "/rosters", label: "Rosters", icon: ListChecks, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] },
  { href: "/scream-session", label: "Scream", icon: Megaphone, roles: [UserRole.EXECUTIVE_ADMIN] },
  { href: "/area-dashboard", label: "Area", icon: FileText, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
  { href: "/switches", label: "Switches", icon: Repeat2, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] },
  { href: "/exports", label: "Exports", icon: Download, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
  { href: "/admin/users", label: "Users", icon: Settings, roles: [UserRole.EXECUTIVE_ADMIN] }
];

export function AppShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: UserRole; area?: { name: string } | null };
}) {
  const items = navItems.filter((item) => item.roles.includes(user.role));
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="no-print fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-forest-900 text-white shadow-lg md:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Link href="/dashboard" className="leading-tight" onClick={() => setMenuOpen(false)}>
            <span className="block text-base font-bold">Camp Walden</span>
            <span className="block text-xs font-medium text-lake-100">A/B Operations</span>
          </Link>
          <div className="flex items-center gap-2">
            <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white" type="button" onClick={() => setMenuOpen(true)}>
              <Menu className="h-4 w-4" />
              Menu
            </button>
            <form action="/api/auth/logout" method="post">
              <button className="rounded-lg p-2 text-forest-50 hover:bg-white/10" title="Sign out" type="submit">
                <LogOut className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className={`no-print fixed inset-0 z-40 md:hidden ${menuOpen ? "" : "pointer-events-none"}`} aria-hidden={!menuOpen}>
        <button className={`absolute inset-0 bg-slate-950/50 transition-opacity ${menuOpen ? "opacity-100" : "opacity-0"}`} type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
        <aside className={`absolute left-0 top-0 h-full w-80 max-w-[86vw] bg-forest-900 text-white shadow-2xl transition-transform ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-start justify-between border-b border-white/10 p-5">
            <div>
              <p className="text-lg font-bold">Camp Walden</p>
              <p className="text-sm text-lake-100">{roleLabel(user.role)}</p>
              {user.area ? <p className="mt-1 text-xs font-medium text-lake-100">{user.area.name}</p> : null}
            </div>
            <button className="rounded-lg p-2 text-forest-50 hover:bg-white/10" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="grid gap-1 overflow-y-auto p-3">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition ${active ? "bg-white text-forest-900 shadow-sm" : "text-forest-50 hover:bg-white/10"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
      </div>

      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-white/10 bg-forest-900 text-white md:block">
        <div className="flex flex-col items-start gap-5 p-5">
          <Link href="/dashboard" className="leading-tight">
            <span className="block text-lg font-bold">Camp Walden</span>
            <span className="block text-xs font-medium text-lake-100">A/B Operations</span>
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="rounded-md p-2 text-forest-50 hover:bg-white/10" title="Sign out" type="submit">
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </div>

        <nav className="grid gap-1 px-3 pb-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? "bg-white text-forest-900 shadow-sm" : "text-forest-50 hover:bg-white/10"}`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-t border-white/10 p-5 text-sm md:block">
          <p className="font-semibold">{user.name}</p>
          <p className="text-forest-100">{roleLabel(user.role)}</p>
          {user.area ? <p className="mt-1 text-lake-100">{user.area.name}</p> : null}
        </div>
      </aside>
      <main className="px-4 pb-10 pt-24 md:ml-64 md:px-8 md:pt-8">{children}</main>
    </div>
  );
}
