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

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] },
  { href: "/admin/menu-builder", label: "Menu", icon: CalendarDays, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
  { href: "/admin/data-center", label: "Data Center", icon: Database, roles: [UserRole.EXECUTIVE_ADMIN] },
  { href: "/admin/import/campers", label: "Campers", icon: Upload, roles: [UserRole.EXECUTIVE_ADMIN] },
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

  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-x-0 top-0 z-20 border-b border-white/60 bg-forest-900 text-white md:bottom-0 md:right-auto md:w-64 md:border-b-0 md:border-r">
        <div className="flex h-16 items-center justify-between px-4 md:h-auto md:flex-col md:items-start md:gap-5 md:p-5">
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

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:grid md:overflow-visible md:px-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-forest-50 transition hover:bg-white/10"
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
