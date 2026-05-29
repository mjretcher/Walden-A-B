import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ExportsPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const areas = await prisma.area.findMany({ orderBy: { name: "asc" } });
  const areaId = user.areaId ?? areas[0]?.id;

  return (
    <AppShell user={user}>
      <PageHeader title="Exports" eyebrow="CSV, XLSX, and print/PDF support" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Staff A/B Schedule</h2>
          <p className="mt-2 text-sm text-slate-500">Spreadsheet-style output matching the staff schedule columns.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className={secondaryButtonClass} href="/api/exports/staff-schedule?format=csv">CSV</a>
            <a className={secondaryButtonClass} href="/api/exports/staff-schedule?format=xlsx">XLSX</a>
          </div>
        </section>
        <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Area Block Plan</h2>
          <p className="mt-2 text-sm text-slate-500">Grouped by period, activity, assignment, and staff.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className={secondaryButtonClass} href={`/api/exports/area-block-plan?format=csv&areaId=${areaId}`}>CSV</a>
            <a className={secondaryButtonClass} href={`/api/exports/area-block-plan?format=xlsx&areaId=${areaId}`}>XLSX</a>
          </div>
        </section>
        <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">PDF / Print Views</h2>
          <p className="mt-2 text-sm text-slate-500">Cards and rosters are optimized for browser print to PDF.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className={secondaryButtonClass} href="/cards">Cards</a>
            <a className={secondaryButtonClass} href="/rosters">Rosters</a>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
