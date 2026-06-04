import Link from "next/link";
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
  QrCode,
  Repeat2,
  Settings,
  Upload,
  Users
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
  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.roles.includes(user.role)) }))
    .filter((group) => group.items.length);
  const mobileItems = groups.flatMap((group) => group.items);

  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-x-0 top-0 z-20 border-b border-slate-200 bg-white/95 text-ink shadow-sm backdrop-blur md:bottom-0 md:right-auto md:w-72 md:border-b-0 md:border-r">
        <div className="flex h-16 items-center justify-between px-4 md:h-auto md:flex-col md:items-stretch md:gap-5 md:p-5">
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

        <nav className="flex gap-2 overflow-x-auto px-4 pb-3 md:hidden">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-forest-900 transition hover:border-lake-200 hover:bg-lake-50"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <nav className="hidden min-h-0 flex-1 overflow-y-auto px-3 pb-3 md:block">
          {groups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-3 text-[0.7rem] font-black uppercase tracking-[0.18em] text-slate-400">{group.label}</p>
              <div className="mt-2 grid gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-forest-50 hover:text-forest-900"
                    >
                      <Icon className="h-4 w-4 text-lake-700" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-slate-200 p-5 text-sm md:block">
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
