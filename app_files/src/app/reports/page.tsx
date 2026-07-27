import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export default async function ReportsPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const reports = [
    { title: "Registration Assignments", description: "One-time registration day assignments with a classic one-page print sheet.", href: "/reports/registration-assignments", action: "Open report", adminOnly: true },
    { title: "Registration Cabin Coverage", description: "Staff-only bunk sheet with registration-table staff struck through — double-check no cabin is wiped on registration day.", href: "/reports/registration-coverage", action: "Open coverage check", adminOnly: true },
    { title: "Optionals Assignments", description: "Hand-pick which activities are open as optionals each period, and who's running them. Printable A-day and B-day sheets.", href: "/reports/optionals-assignments", action: "Open report" },
    { title: "Staff Off Periods", description: "Who's off which period — toggle staff off/on and view by period or by staff, split by A-day and B-day.", href: "/reports/staff-off-periods", action: "Open report" },
    { title: "Staff Working Periods", description: "Who's actually working which period — same by-period/by-staff view as Staff Off Periods, split by A-day and B-day.", href: "/reports/staff-working-periods", action: "Open report" },
    { title: "Staff A/B Schedule", description: "Live staff schedule view for registration and Scream Session workflows.", href: "/reports/staff-schedule", action: "Open live view" },
    { title: "Staff & Cabins by Period", description: "Who's actually working a given period, and which cabin they're in. Defaults to Twilight (5A & 5B); pick any period(s).", href: "/reports/staff-period-cabins", action: "Open report" },
    { title: "Waterfront Staffing", description: "Printable A-day and B-day duty grid for the waterfront — Canoe, Kayak, Swim, SUP, Sail, Ski, Crash, Fish. LGs marked with *.", href: "/reports/waterfront-staffing", action: "Open duty sheet" },
    { title: "MAC Swim Lap Chart", description: "Printable MAC Swim record — Buddy #, Name, and Cabin auto-filled; day columns left blank for handwritten lap counts.", href: "/reports/mac-swim", action: "Open lap chart" },
    { title: "Buddy Numbers List", description: "Plain printable reference list — Buddy #, Name, and Cabin, sorted by buddy number.", href: "/reports/buddy-numbers", action: "Open list" },
    { title: "Athletics Assignments", description: "Printable A-day and B-day station grid for Athletics — which activity runs at each station, by period.", href: "/reports/athletics-staffing", action: "Open duty sheet" },
    { title: "Arts & Crafts Staffing", description: "Printable A-day and B-day duty grid for Arts & Crafts, one column per activity.", href: "/reports/arts-and-crafts-staffing", action: "Open duty sheet" },
    { title: "Nature Staffing", description: "Printable A-day and B-day duty grid for Nature, one column per activity.", href: "/reports/nature-staffing", action: "Open duty sheet" },
    { title: "Media & Tech Staffing", description: "Printable A-day and B-day duty grid for Media & Tech, one column per activity.", href: "/reports/media-staffing", action: "Open duty sheet" },
    { title: "Performing Arts Staffing", description: "Printable A-day and B-day duty grid for Performing Arts, one column per activity.", href: "/reports/performing-arts-staffing", action: "Open duty sheet" },
    { title: "Area Block Plan", description: "Monitor area blocks by period, activity, assignment, and staff.", href: "/reports/area-block-plan", action: "Open monitor" },
    { title: "A/B Menu", description: "Current printable A/B menu report.", href: "/reports/ab-menu", action: "Open menu" },
    { title: "Master A/B Menu", description: "The full master A/B menu grid — printable in landscape with the unit-labels toggle.", href: "/reports/master-ab-menu", action: "Open master menu" },
    { title: "Waitlists", description: "Who's waitlisted for full classes, plus history from past sessions for planning capacity.", href: "/reports/waitlists", action: "Open waitlists" },
    { title: "Final Week Class Sizes", description: "Every class roster size now vs. after the two-week campers go home — flags the classes that empty out or drop to a handful.", href: "/reports/final-week-sizes", action: "Open report" },
    // Printable views whose primary home is elsewhere in the app — listed
    // here too so Reports is the one-stop index of everything printable
    // (per Mike). Each link goes to the SAME page as its original home;
    // nothing is duplicated, and each page's own role gate still applies.
    { title: "Bunk Cabin Sheets", description: "Full cabin assignment sheets with campers, styled to match the paper sheets. Lives in Bunk Management — same page, linked here too.", href: "/bunk-management/print", action: "Open cabin sheets", adminOnly: true },
    { title: "Bunk Staff Sheet", description: "Staff-only cabin assignments (with OUT OF CABIN box) — boys page + girls page in one print job. Lives in Bunk Management.", href: "/bunk-management/print-staff", action: "Open staff sheet", adminOnly: true },
    { title: "Cabin Report", description: "One printable sheet per cabin — every camper's full class names by period. Prints all cabins in one job for hanging in the cabins.", href: "/reports/cabin-report", action: "Open cabin report" },
    { title: "Registration Cards", description: "Printable camper registration cards with QR codes, Bluegill bold+underline, and per-page layout controls.", href: "/cards", action: "Open cards" },
    { title: "Rosters", description: "Printable class rosters by period and area — portrait layout with auto-size tiers and outage awareness.", href: "/rosters", action: "Open rosters" },
    { title: "Outages / Missing Kids", description: "Active and past outages with the printable hierarchical missing-kids report.", href: "/outages", action: "Open outages" },
    { title: "Exports", description: "CSV, XLSX, cards, rosters, and other print/export tools.", href: "/exports", action: "Open exports" }
  ].filter((report) => !report.adminOnly || user.role === UserRole.EXECUTIVE_ADMIN);

  return (
    <AppShell user={user}>
      <PageHeader
        title="Reports"
        eyebrow="Print, live views, and exports"
        description="Main home for printable reports, live report views, and export tools."
        backHref="/dashboard"
        backLabel="Back to Dashboard"
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
