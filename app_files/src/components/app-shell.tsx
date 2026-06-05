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

const navGroups = [
  {
    label: "Run Camp",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] },
      { href: "/registration", label: "Registration", icon: ClipboardCheck, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] },
      { href: "/scream-session", label: "Scream Session", icon: Megaphone, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/area-dashboard", label: "Area Dashboard", icon: FileText, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/rosters", label: "Rosters", icon: ListChecks, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] },
      { href: "/attendance", label: "Attendance", icon: ClipboardCheck, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] }
    ]
  },
  {
    label: "Manage",
    items: [
      { href: "/admin/campers", label: "Camper Mgmt", icon: Users, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/menu-builder", label: "Menu Builder", icon: CalendarDays, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/switches", label: "Switches", icon: Repeat2, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/cards", label: "Cards", icon: QrCode, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/exports", label: "Exports", icon: Download, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] }
    ]
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/data-center", label: "Data Center", icon: Database, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/structure", label: "Structure", icon: Settings, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/staff", label: "Staff", icon: Users, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/import/campers", label: "Camper Import", icon: Upload, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/import/staff", label: "Staff Import", icon: Upload, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/users", label: "Users", icon: Settings, roles: [UserRole.EXECUTIVE_ADMIN] }
    ]
  }
];

export function AppShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: UserRole; area?: { name: string } | null };
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(user.role)) }))
    .filter((group) => group.items.length);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-screen">
      <header className="no-print fixed inset-x-0 top-0 z-30 border-b border-slate-200 bg-white/95 text-ink shadow-sm backdrop-blur md:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center gap-3 leading-tight" onClick={() => setMenuOpen(false)}>
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-forest-900 text-sm font-black text-white">W</span>
            <span>
              <span className="block text-base font-black text-forest-900">Camp Walden</span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-lake-700">A/B Operations</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-forest-900 shadow-sm"
              type="button"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-4 w-4" />
              Menu
            </button>
            <form action="/api/auth/logout" method="post">
              <button className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-forest-50" title="Sign out" type="submit">
                <LogOut className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className={`no-print fixed inset-0 z-40 md:hidden ${menuOpen ? "" : "pointer-events-none"}`} aria-hidden={!menuOpen}>
        <button
          className={`absolute inset-0 bg-slate-950/50 transition-opacity ${menuOpen ? "opacity-100" : "opacity-0"}`}
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        />
        <aside className={`absolute left-0 top-0 h-full w-80 max-w-[86vw] bg-forest-900 text-white shadow-2xl transition-transform ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-start justify-between border-b border-white/10 p-5">
            <div>
              <p className="text-lg font-black">Camp Walden</p>
              <p className="text-sm text-lake-100">{roleLabel(user.role)}</p>
              {user.area ? <p className="mt-1 text-xs font-medium text-lake-100">{user.area.name}</p> : null}
            </div>
            <button className="rounded-lg p-2 text-forest-50 hover:bg-white/10" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="grid gap-5 overflow-y-auto p-3">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-3 text-[0.7rem] font-black uppercase tracking-[0.18em] text-forest-100/70">{group.label}</p>
                <div className="mt-2 grid gap-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition ${active ? "bg-white text-forest-900 shadow-sm" : "text-forest-50 hover:bg-white/10"}`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
      </div>

      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200 bg-white/95 text-ink shadow-sm backdrop-blur md:flex md:flex-col">
        <div className="flex items-center justify-between gap-3 p-5">
          <Link href="/dashboard" className="flex items-center gap-3 leading-tight">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-forest-900 text-sm font-black text-white">W</span>
            <span>
              <span className="block text-lg font-black text-forest-900">Camp Walden</span>
              <span className="block text-xs font-bold uppercase tracking-[0.18em] text-lake-700">A/B Operations</span>
            </span>
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="rounded-md border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-forest-200 hover:bg-forest-50 hover:text-forest-900" title="Sign out" type="submit">
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-3 text-[0.7rem] font-black uppercase tracking-[0.18em] text-slate-400">{group.label}</p>
              <div className="mt-2 grid gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition ${active ? "bg-forest-900 text-white shadow-sm" : "text-slate-700 hover:bg-forest-50 hover:text-forest-900"}`}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-white" : "text-lake-700"}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-5 text-sm">
          <div className="rounded-lg bg-forest-50 p-3">
            <p className="font-bold text-forest-900">{user.name}</p>
            <p className="mt-1 text-slate-600">{roleLabel(user.role)}</p>
            {user.area ? <p className="mt-1 font-semibold text-lake-700">{user.area.name}</p> : null}
          </div>
        </div>
      </aside>
      <main className="px-4 pb-10 pt-24 md:ml-72 md:px-8 md:pt-8 xl:px-10">{children}</main>
    </div>
  );
}
