import { RegistrationStatus } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { CapacityPill, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export default async function RostersPage() {
  const user = await requireUser();
  const session = await prisma.session.findFirst({ where: { active: true } });
  const offerings = session
    ? await prisma.activityOffering.findMany({
        where: { sessionId: session.id, active: true },
        include: {
          area: true,
          activity: true,
          staffAssignments: { include: { staff: true } },
          registrations: {
            where: { status: { in: activeRegistration } },
            include: { camper: { include: { cabin: true } } },
            orderBy: { camper: { lastName: "asc" } }
          }
        },
        orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
      })
    : [];

  return (
    <AppShell user={user}>
      <PageHeader title="Rosters" eyebrow="Auto-updating activity sheets">
        <span className={`${secondaryButtonClass} no-print`}>Use browser print</span>
      </PageHeader>

      {!session ? (
        <div className="no-print rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          No active session is selected, so roster sheets are not available yet.
        </div>
      ) : null}

      {session && !offerings.length ? (
        <div className="no-print rounded-lg border border-slate-200 bg-white p-6 text-sm font-medium text-slate-600 shadow-soft">
          No active offerings are available for roster sheets yet.
        </div>
      ) : null}

      <div className="grid gap-6">
        {offerings.map((offering) => (
          <article key={offering.id} className="print-card rounded-lg border border-white bg-white p-5 shadow-soft">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-lake-700">{offering.area.name} roster sheet</p>
                <h2 className="text-2xl font-bold text-forest-900">{offering.activity.name}</h2>
                <p className="text-sm text-slate-500">{session?.name} - Period {PERIOD_LABEL[offering.period]}</p>
                <p className="mt-1 text-sm text-slate-600">Staff: {offering.staffAssignments.map((assignment) => `${assignment.staff.firstName} ${assignment.staff.lastName}`).join(", ") || "Unassigned"}</p>
              </div>
              <div className="text-right">
                <CapacityPill count={offering.registrations.length} limit={offering.rosterLimit} limitType={offering.limitType} />
                <p className="mt-2 text-sm text-slate-500">Page 1</p>
              </div>
            </div>

            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="bg-forest-900 text-white">
                  <th className="w-10 border border-forest-900 p-2">#</th>
                  <th className="border border-forest-900 p-2 text-left">Name</th>
                  <th className="border border-forest-900 p-2 text-left">Cabin</th>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <th key={day} className="w-10 border border-forest-900 p-2">{day}</th>)}
                  <th className="border border-forest-900 p-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.max(offering.registrations.length, offering.rosterLimit ?? 12) }).map((_, index) => {
                  const registration = offering.registrations[index];
                  return (
                    <tr key={registration?.id ?? `blank-${index}`}>
                      <td className="border border-slate-300 p-2 text-center">{index + 1}</td>
                      <td className="border border-slate-300 p-2">{registration ? `${registration.camper.firstName} ${registration.camper.lastName}` : ""}</td>
                      <td className="border border-slate-300 p-2">{registration?.camper.cabin?.name ?? ""}</td>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => <td key={day} className="border border-slate-300 p-2">&nbsp;</td>)}
                      <td className="border border-slate-300 p-2">&nbsp;</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
