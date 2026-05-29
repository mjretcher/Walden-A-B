import { RegistrationStatus, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAMPER_PERIODS, PERIOD_LABEL, SWIM_CODE } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export default async function CardsPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const campers = session
    ? await prisma.camper.findMany({
        where: { sessionId: session.id, active: true },
        include: {
          cabin: true,
          registrations: {
            where: { status: { in: activeRegistration } },
            include: { offering: { include: { activity: true } } }
          }
        },
        orderBy: [{ cabin: { name: "asc" } }, { lastName: "asc" }]
      })
    : [];

  return (
    <AppShell user={user}>
      <PageHeader title="Registration Cards" eyebrow="Paper-compatible QR backup">
        <span className={`${secondaryButtonClass} no-print`}>Use browser print</span>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-2 print:block">
        {campers.map((camper) => {
          const byPeriod = new Map(camper.registrations.map((registration) => [registration.period, registration]));
          return (
            <article key={camper.id} className="print-card rounded-lg border-2 border-forest-900 bg-white p-5 shadow-soft print:mb-5">
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-forest-700">Camp Walden Registration Card</p>
                  <h2 className="mt-1 text-2xl font-bold text-forest-900">{camper.firstName} {camper.lastName}</h2>
                  <p className="text-sm text-slate-600">Cabin {camper.cabin?.name ?? "-"} - Swim {SWIM_CODE[camper.swimLevel]}</p>
                  {camper.medicalFlags ? <Badge tone="amber">{camper.medicalFlags}</Badge> : null}
                </div>
                <img alt={`QR for ${camper.firstName} ${camper.lastName}`} className="h-24 w-24" src={`/api/campers/${camper.id}/qr`} />
              </div>

              <table className="mt-5 w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-forest-900 text-white">
                    <th className="border border-forest-900 p-2 text-left">Period</th>
                    <th className="border border-forest-900 p-2 text-left">Activity</th>
                    <th className="border border-forest-900 p-2 text-left">Counselor approval</th>
                  </tr>
                </thead>
                <tbody>
                  {CAMPER_PERIODS.map((period) => {
                    const registration = byPeriod.get(period);
                    return (
                      <tr key={period}>
                        <td className="w-16 border border-slate-300 p-2 font-bold">{PERIOD_LABEL[period]}</td>
                        <td className="border border-slate-300 p-2">{registration?.offering.activity.name ?? ""}</td>
                        <td className="border border-slate-300 p-2">{registration?.counselorApproval ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-4 text-xs text-slate-500">Camper ID: {camper.id}</p>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
