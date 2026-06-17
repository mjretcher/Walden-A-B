import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ExportsSearchParams = {
  areaId?: string;
};

export default async function ExportsPage({ searchParams }: { searchParams?: Promise<ExportsSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const areas = await prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const areaId = user.role === UserRole.AREA_HEAD && user.areaId ? user.areaId : params.areaId ?? areas[0]?.id;
  const selectedArea = areas.find((area) => area.id === areaId);

  return (
    <AppShell user={user}>
      <PageHeader title="Exports" eyebrow="CSV, XLSX, and print/PDF support" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Staff A/B Schedule</h2>
          <p className="mt-2 text-sm text-slate-500">Spreadsheet-style output matching the staff schedule columns.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className={secondaryButtonClass} href="/reports/staff-schedule" target="_blank" rel="noopener noreferrer">Live Scream Session View</a>
            <a className={secondaryButtonClass} href="/api/exports/staff-schedule?format=csv">CSV</a>
            <a className={secondaryButtonClass} href="/api/exports/staff-schedule?format=xlsx">XLSX</a>
          </div>
        </section>
        <section className="rounded-lg border border-white bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-forest-900">Area Block Plan</h2>
          <p className="mt-2 text-sm text-slate-500">Grouped by period, activity, assignment, and staff.</p>
          {user.role === UserRole.EXECUTIVE_ADMIN ? (
            <form className="mt-4 flex flex-wrap items-end gap-2" method="get">
              <label className="text-sm font-semibold text-slate-900">
                Area
                <select className={`${inputClass} mt-1`} name="areaId" defaultValue={areaId}>
                  {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
              </label>
              <button className={secondaryButtonClass} type="submit">Set area</button>
            </form>
          ) : selectedArea ? <p className="mt-3 text-sm font-semibold text-slate-700">Area: {selectedArea.name}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <a className={secondaryButtonClass} href={`/reports/area-block-plan?areaId=${areaId}`}>Live Monitor</a>
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
