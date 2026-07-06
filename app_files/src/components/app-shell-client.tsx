"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gender, UserRole } from "@prisma/client";
import {
  AlertTriangle,
  Bed,
  Building2,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  Home,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  Puzzle,
  QrCode,
  Repeat2,
  Settings,
  Upload,
  Users,
  ListTodo,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CampWaldenLogo } from "@/components/brand";
import { GlobalSearchTypeahead } from "@/components/global-search-typeahead";
import { roleLabel } from "@/lib/access";
import { sessionColorClasses } from "@/lib/session-colors";

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Home, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] }
    ]
  },
  {
    label: "Run Camp",
    items: [
      { href: "/registration", label: "Registration", icon: ClipboardCheck, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] },
      { href: "/scream-session", label: "Scream Session", icon: Megaphone, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/bunk-management", label: "Bunk Management", icon: Bed, roles: [UserRole.EXECUTIVE_ADMIN], bunkManagement: true },
      { href: "/area-dashboard", label: "Area Dashboard", icon: FileText, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/outages", label: "Outages", icon: AlertTriangle, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/rosters", label: "Rosters", icon: ListChecks, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] },
      { href: "/attendance", label: "Attendance", icon: ClipboardCheck, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD, UserRole.COUNSELOR] }
    ]
  },
  {
    label: "Manage",
    items: [
      { href: "/admin/campers", label: "Camper Mgmt", icon: Users, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/menu-builder", label: "Menu Builder", icon: Puzzle, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/admin/staff-assignments", label: "Staff Assignments", icon: Users, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/switches", label: "Switches", icon: Repeat2, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/prescream", label: "PreScream", icon: ListTodo, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/cards", label: "Cards", icon: QrCode, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/reports", label: "Reports", icon: FileText, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] },
      { href: "/exports", label: "Exports", icon: Download, roles: [UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD] }
    ]
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/users", label: "Users", icon: Users, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/structure", label: "Structure", icon: Building2, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/cabins", label: "Cabins", icon: Building2, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/staff", label: "Staff", icon: Users, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/import/campers", label: "Imports", icon: Upload, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/import/staff", label: "Staff Import", icon: Upload, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/data-center", label: "Data Center", icon: Database, roles: [UserRole.EXECUTIVE_ADMIN] },
      { href: "/admin/structure", label: "Settings", icon: Settings, roles: [UserRole.EXECUTIVE_ADMIN] }
    ]
  }
];

// Small amber dot anchored to the top-right of a nav icon, used to flag the
// Switches item when there are pending requests awaiting the user. The ring
// matches the dark nav background so the dot reads cleanly against the icon.
function NavIcon({ Icon, badgeCount }: { Icon: LucideIcon; badgeCount: number }) {
  return (
    <span className="relative inline-flex shrink-0">
      <Icon className="h-4 w-4 text-current" />
      {badgeCount > 0 ? (
        <>
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-forest-900" aria-hidden="true" />
          <span className="sr-only">{badgeCount} pending</span>
        </>
      ) : null}
    </span>
  );
}

// Small colored dot + session name, shown in the header/sidebar so it's
// always obvious which session (Q1, Q2, etc.) is currently active — this is
// the thing that keeps edits from landing in the wrong session during a
// transition when both are being worked on close together.
function SessionChip({ session, compact }: { session: { name: string; cycle: string; color: string } | null; compact?: boolean }) {
  if (!session) return null;
  const classes = sessionColorClasses(session.color);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${classes.chip} ${classes.chipText} ${compact ? "" : ""}`}
      title={`Active session: ${session.name}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${classes.dot}`} aria-hidden="true" />
      <span className="truncate">{session.name}</span>
    </span>
  );
}

export function AppShellClient({
  children,
  user,
  pendingSwitchCount,
  preScreamConflictCount,
  rosterReprintCount,
  activeSession
}: {
  children: React.ReactNode;
  user: { name: string; email: string; role: UserRole; area?: { name: string } | null; bunkManagementView?: Gender | null };
  pendingSwitchCount: number;
  preScreamConflictCount: number;
  rosterReprintCount: number;
  activeSession: { name: string; cycle: string; color: string } | null;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);
  const mobileMenuRef = useRef<HTMLElement>(null);

  // Persist the desktop nav collapse choice across sessions.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("walden:desktopNavCollapsed");
      if (stored === "1") setDesktopNavCollapsed(true);
    } catch {
      // ignore — localStorage can throw in private mode / older browsers
    }
  }, []);

  function toggleDesktopNav() {
    setDesktopNavCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("walden:desktopNavCollapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  // Bunk Management is a special case: EXECUTIVE_ADMIN sees it via the
  // normal role check below, but the Girls Side Head / Boys Side Head
  // accounts also need to see it despite whatever plain role they hold --
  // that's what bunkManagementView (set independent of role/area) is for.
  // See lib/auth.ts requireBunkManagementAccess for the matching server-side check.
  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.roles.includes(user.role) || (("bunkManagement" in item) && item.bunkManagement && Boolean(user.bunkManagementView))
      )
    }))
    .filter((group) => group.items.length);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  // The pending-switch badge only applies to Switches, the conflict badge
  // only to PreScream, and the reprint badge only to Rosters.
  function badgeCountFor(href: string) {
    if (href === "/switches") return pendingSwitchCount;
    if (href === "/prescream") return preScreamConflictCount;
    if (href === "/rosters") return rosterReprintCount;
    return 0;
  }

  useEffect(() => {
    if (!menuOpen) return;

    if (mobileMenuRef.current) mobileMenuRef.current.scrollTop = 0;

    const scrollY = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const previousDocumentOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overflow = previousDocumentOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-[#fbfdfb] text-slate-950">
      <header className="no-print fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-forest-900 text-white shadow-sm backdrop-blur md:hidden">
        <div className={`h-1.5 w-full ${sessionColorClasses(activeSession?.color).strip}`} aria-hidden="true" />
        <div className="flex h-16 items-center justify-between gap-2 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3 leading-tight" onClick={() => setMenuOpen(false)}>
            <CampWaldenLogo markClassName="h-9 w-11" />
          </Link>
          <SessionChip session={activeSession} compact />
          <div className="flex items-center gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold text-white shadow-sm"
              type="button"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-4 w-4" />
              Menu
            </button>
            <form action="/api/auth/logout" method="post">
              <button className="rounded-lg border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20" title="Sign out" type="submit">
                <LogOut className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
        <div className="px-4 pb-3">
          <GlobalSearchTypeahead compact />
        </div>
      </header>

      <div className={`no-print fixed inset-0 z-40 md:hidden ${menuOpen ? "" : "pointer-events-none"}`} aria-hidden={!menuOpen}>
        <button
          className={`absolute inset-0 bg-slate-950/50 transition-opacity ${menuOpen ? "opacity-100" : "opacity-0"}`}
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
        />
        <aside
          ref={mobileMenuRef}
          className={`absolute left-0 top-0 flex h-dvh max-h-dvh w-80 max-w-[86vw] flex-col overflow-y-auto bg-[radial-gradient(circle_at_20%_0%,#0d6b42_0%,#052f22_52%,#04271d_100%)] text-white shadow-2xl transition-transform [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain] ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-start justify-between border-b border-white/10 p-5">
            <div className="min-w-0">
              <CampWaldenLogo />
              <p className="mt-4 text-sm text-lake-100">{roleLabel(user.role)}</p>
              {user.area ? <p className="mt-1 text-xs font-medium text-lake-100">{user.area.name}</p> : null}
              <div className="mt-3">
                <SessionChip session={activeSession} />
              </div>
            </div>
            <button className="rounded-lg p-2 text-forest-50 hover:bg-white/10" type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="grid gap-5 p-3">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-3 text-[0.7rem] font-black uppercase tracking-[0.18em] text-forest-100/70">{group.label}</p>
                <div className="mt-2 grid gap-1">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition ${active ? "bg-white/16 text-white shadow-sm ring-1 ring-white/10" : "text-forest-50 hover:bg-white/10"}`}
                      >
                        <NavIcon Icon={item.icon} badgeCount={badgeCountFor(item.href)} />
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

      <aside className={`no-print fixed inset-y-0 left-0 z-20 hidden w-[244px] bg-[radial-gradient(circle_at_25%_0%,#0d6b42_0%,#052f22_48%,#04271d_100%)] text-white shadow-[18px_0_45px_rgba(4,39,29,0.16)] ${desktopNavCollapsed ? "" : "md:flex md:flex-col"}`}>
        <div className={`h-1.5 w-full ${sessionColorClasses(activeSession?.color).strip}`} aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 p-5 pb-3">
          <Link href="/dashboard" className="flex items-center gap-3 leading-tight">
            <CampWaldenLogo />
          </Link>
          <button
            type="button"
            onClick={toggleDesktopNav}
            className="grid h-8 w-8 place-items-center rounded-md text-white/80 transition hover:bg-white/10 hover:text-white"
            title="Hide menu"
            aria-label="Hide menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pb-4">
          <SessionChip session={activeSession} />
        </div>

        <div className="px-4 pb-4">
          <GlobalSearchTypeahead compact />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-3 text-[0.68rem] font-black uppercase tracking-[0.18em] text-forest-100/70">{group.label}</p>
              <div className="mt-2 grid gap-1">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition ${active ? "bg-white/16 text-white shadow-sm ring-1 ring-white/10" : "text-forest-50 hover:bg-white/10 hover:text-white"}`}
                    >
                      <NavIcon Icon={item.icon} badgeCount={badgeCountFor(item.href)} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/15 p-4 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/8 p-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-white/20 font-black text-white">
              {user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-white">{user.name}</p>
              <p className="mt-0.5 truncate text-xs text-forest-100">{roleLabel(user.role)}</p>
              {user.area ? <p className="mt-1 truncate text-xs font-semibold text-lake-100">{user.area.name}</p> : null}
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="rounded-md p-2 text-white/80 transition hover:bg-white/10 hover:text-white" title="Sign out" type="submit">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Floating "Show menu" button — only visible on desktop when the sidebar
        * is collapsed. Sits in the top-left of the viewport so one click brings
        * the nav back. */}
      {desktopNavCollapsed ? (
        <button
          type="button"
          onClick={toggleDesktopNav}
          className="no-print fixed left-3 top-3 z-30 hidden items-center gap-2 rounded-lg bg-forest-900 px-3 py-2 text-sm font-black text-white shadow-lg transition hover:bg-forest-800 md:inline-flex"
          title="Show menu"
          aria-label="Show menu"
        >
          <Menu className="h-4 w-4" />
          Menu
        </button>
      ) : null}

      {/* id="main-content" is the skip-link target. tabIndex={-1} lets
        * the link's focus jump here without making the <main> tabbable
        * during normal keyboard navigation. */}
      <main id="main-content" tabIndex={-1} className={`min-h-screen px-4 pb-10 pt-32 md:px-8 xl:px-9 focus:outline-none ${desktopNavCollapsed ? "md:ml-0 md:pt-14" : "md:ml-[244px] md:pt-7"}`}>{children}</main>
    </div>
  );
}
