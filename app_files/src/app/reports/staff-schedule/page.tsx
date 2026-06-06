import Link from "next/link";
import { Download, RefreshCw } from "lucide-react";
import { UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";

export default async function StaffScheduleReport() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const staff = session
    ? await prisma.staff.findMany({
        where: { active: true },
        include: {
          primaryArea: true,
          assignments: {
            where: { sessionId: session.id },
            include: { offering: { include: { area: true, activity: true } } }
          }
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
      })
    : [];

  return (
    <AppShell user={user}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-forest-900">Staff A/B Schedule View</h1>
          <p className="mt-1 text-slate-600">Alphabetical live staff assignment grid for {session?.name ?? "the active session"}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={secondaryButtonClass} href="/reports/staff-schedule"><RefreshCw className="h-4 w-4" />Refresh</Link>
          <a className={secondaryButtonClass} href="/api/exports/staff-schedule?format=csv"><Download className="h-4 w-4" />CSV</a>
          <a className={secondaryButtonClass} href="/api/exports/staff-schedule?format=xlsx"><Download className="h-4 w-4" />XLSX</a>
        </div>
      </div>

      <section className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-soft">
        <table className="min-w-[1180px] w-full border-collapse text-sm">
          <thead>
            <tr className="bg-forest-900 text-left text-white">
              <th className="sticky left-0 z-10 min-w-56 bg-forest-900 p-3">Staff</th>
              <th className="min-w-36 p-3">Status / Cert</th>
              {STAFF_PERIODS.map((period) => <th key={period} className="min-w-36 p-3 text-center">{PERIOD_LABEL[period]}</th>)}
            </tr>
          </thead>
          <tbody>
            {staff.map((person) => {
              const assignments = new Map(person.assignments.map((assignment) => [assignment.period, assignment]));
              return (
                <tr key={person.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-inherit p-3">
                    <p className="font-black text-slate-950">{person.firstName} {person.lastName}</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-500">{person.primaryArea?.name ?? "No primary area"}</p>
                  </td>
                  <td className="p-3 text-xs font-bold text-slate-600">{person.statusCertification ?? ""}</td>
                  {STAFF_PERIODS.map((period) => {
                    const assignment = assignments.get(period);
                    return (
                      <td key={period} className="border-l border-slate-100 p-2 align-top">
                        {assignment ? (
                          <div className="rounded-lg border border-lake-100 bg-lake-50 p-2">
                            <p className="font-black text-lake-900">{assignment.offering.activity.name}</p>
                            <p className="mt-1 text-xs font-bold text-slate-500">{assignment.offering.area.name}</p>
                          </div>
                        ) : (
                          <span className="block rounded-lg border border-dashed border-slate-200 p-2 text-center text-xs font-bold text-slate-400">Open</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!staff.length ? <p className="p-6 text-sm font-bold text-slate-500">No active staff found.</p> : null}
      </section>

      <p className="mt-4 text-sm font-medium text-slate-500">
        <Badge tone="blue">Live view</Badge> Refresh during Scream Session to see newly saved assignments.
      </p>
    </AppShell>
  );
}
