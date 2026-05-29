import { RegistrationStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, CapacityPill, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export default async function AreaDashboardPage({ searchParams }: { searchParams?: Promise<{ area?: string }> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const params = await searchParams;
  const areas = await prisma.area.findMany({ orderBy: { name: "asc" } });
  const selectedAreaId = user.role === UserRole.AREA_HEAD && user.areaId ? user.areaId : params?.area ?? areas[0]?.id;

  const offerings = session
    ? await prisma.activityOffering.findMany({
        where: { sessionId: session.id, areaId: selectedAreaId, active: true },
        include: {
          area: true,
          activity: true,
          staffAssignments: { include: { staff: true } },
          _count: { select: { registrations: { where: { status: { in: activeRegistration } } } } }
        },
        orderBy: [{ period: "asc" }, { activity: { name: "asc" } }]
      })
    : [];

  return (
    <AppShell user={user}>
      <PageHeader title="Area Head Dashboard" eyebrow="Live staffing visibility" />

      {user.role === UserRole.EXECUTIVE_ADMIN ? (
        <form className="no-print mb-5">
          <select className="min-h-11 rounded-md border border-slate-200 bg-white px-3" name="area" defaultValue={selectedAreaId}>
            {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
          <button className="ml-2 rounded-md bg-forest-700 px-4 py-2 font-semibold text-white">Filter</button>
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {offerings.map((offering) => {
          const camperCount = offering._count.registrations;
          const staffCount = offering.staffAssignments.length;
          const missing = Math.max(offering.staffTarget - staffCount, 0);
          const overCapacity = Boolean(offering.rosterLimit && camperCount > offering.rosterLimit);
          const status = overCapacity ? "Over capacity" : missing ? "Needs staff" : staffCount > offering.staffTarget ? "Overstaffed" : "Complete";

          return (
            <article key={offering.id} className="rounded-lg border border-white bg-white p-5 shadow-soft">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-lake-700">{PERIOD_LABEL[offering.period]}</p>
                  <h2 className="text-xl font-bold text-forest-900">{offering.activity.name}</h2>
                  <p className="text-sm text-slate-500">{offering.area.name}</p>
                </div>
                <Badge tone={status === "Complete" ? "green" : overCapacity ? "red" : "amber"}>{status}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md bg-paper p-3">
                  <p className="text-slate-500">Campers</p>
                  <div className="mt-1"><CapacityPill count={camperCount} limit={offering.rosterLimit} limitType={offering.limitType} /></div>
                </div>
                <div className="rounded-md bg-paper p-3">
                  <p className="text-slate-500">Staff</p>
                  <p className="mt-1 font-bold">{staffCount} / {offering.staffTarget}</p>
                </div>
                <div className="rounded-md bg-paper p-3">
                  <p className="text-slate-500">Missing</p>
                  <p className="mt-1 font-bold">{missing}</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600">Assigned: {offering.staffAssignments.map((assignment) => `${assignment.staff.firstName} ${assignment.staff.lastName}`).join(", ") || "None yet"}</p>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
