import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export default async function ReportsPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const reports = [
    { title: "Registration Assignments", description: "One-time registration day assignments with a classic one-page print sheet.", href: "/reports/registration-assignments", action: "Open report", adminOnly: true },
    { title: "Staff A/B Schedule", description: "Live staff schedule view for registration and Scream Session workflows.", href: "/reports/staff-schedule", action: "Open live view" },
    { title: "Waterfront Staffing", description: "Printable A-day and B-day duty grid for the waterfront — Canoe, Kayak, Swim, SUP, Sail, Ski, Crash, Fish. LGs marked with *.", href: "/reports/waterfront-staffing", action: "Open duty sheet" },
    { title: "Athletics Assignments", description: "Printable A-day and B-day station grid for Athletics — which activity runs at each station, by period.", href: "/reports/athletics-staffing", action: "Open duty sheet" },
    { title: "Arts & Crafts Staffing", description: "Printable A-day and B-day duty grid for Arts & Crafts, one column per activity.", href: "/reports/arts-and-crafts-staffing", action: "Open duty sheet" },
    { title: "Nature Staffing", description: "Printable A-day and B-day duty grid for Nature, one column per activity.", href: "/reports/nature-staffing", action: "Open duty sheet" },
    { title: "Media & Tech Staffing", description: "Printable A-day and B-day duty grid for Media & Tech, one column per activity.", href: "/reports/media-staffing", action: "Open duty sheet" },
    { title: "Performing Arts Staffing", description: "Printable A-day and B-day duty grid for Performing Arts, one column per activity.", href: "/reports/performing-arts-staffing", action: "Open duty sheet" },
    { title: "Area Block Plan", description: "Monitor area blocks by period, activity, assignment, and staff.", href: "/reports/area-block-plan", action: "Open monitor" },
    { title: "A/B Menu", description: "Current printable A/B menu report.", href: "/reports/ab-menu", action: "Open menu" },
    { title: "Waitlists", description: "Who's waitlisted for full classes, plus history from past sessions for planning capacity.", href: "/reports/waitlists", action: "Open waitlists" },
    { title: "Exports", description: "CSV, XLSX, cards, rosters, and other print/export tools.", href: "/exports", action: "Open exports" }
  ].filter((report) => !report.adminOnly || user.role === UserRole.EXECUTIVE_ADMIN);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Reports"
        eyebrow="Print, live views, and exports"
        description="Main home for printable reports, live report views, and export tools."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <section key={report.href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-soft">
            <h2 className="text-lg font-black text-forest-900">{report.title}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{report.description}</p>
            <div className="mt-4">
              <a className={secondaryButtonClass} href={report.href}>{report.action}</a>
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
