import { Gender, Period, RegistrationStatus, Unit, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_CODE, UNIT_LABEL } from "@/lib/periods";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const leftPeriods = [Period.P1A, Period.P2A, Period.P3A, Period.P4A];
const rightPeriods = [Period.P1B, Period.P2B, Period.P3B, Period.P4B];

type CardsSearchParams = {
  unit?: string | string[];
  gender?: string | string[];
  cabin?: string | string[];
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function isUnit(value?: string): value is Unit {
  return !!value && Object.values(Unit).includes(value as Unit);
}

function isGender(value?: string): value is Gender {
  return !!value && Object.values(Gender).includes(value as Gender);
}

function genderLabel(gender: Gender) {
  return gender.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function CardsPage({ searchParams }: { searchParams?: Promise<CardsSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const selectedUnit = firstParam(params.unit);
  const selectedGender = firstParam(params.gender);
  const selectedCabin = firstParam(params.cabin);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const allCampers = session
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

  const cabins = Array.from(new Set(allCampers.map((camper) => camper.cabin?.name).filter(Boolean))).sort();
  const campers = allCampers.filter((camper) => {
    if (isUnit(selectedUnit) && camper.unit !== selectedUnit) return false;
    if (isGender(selectedGender) && camper.gender !== selectedGender) return false;
    if (selectedCabin && camper.cabin?.name !== selectedCabin) return false;
    return true;
  });

  return (
    <AppShell user={user}>
      <PageHeader title="Registration Cards" eyebrow="Paper-compatible QR backup">
        <span className={`${secondaryButtonClass} no-print`}>Use browser print</span>
      </PageHeader>

      <form className="no-print mb-5 grid gap-3 rounded-lg border border-white bg-white p-4 shadow-soft md:grid-cols-4" method="get">
        <label className="text-sm font-semibold text-forest-900">
          Unit
          <select className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" name="unit" defaultValue={isUnit(selectedUnit) ? selectedUnit : ""}>
            <option value="">All units</option>
            {Object.values(Unit).map((unit) => (
              <option key={unit} value={unit}>{UNIT_LABEL[unit]}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-semibold text-forest-900">
          Gender
          <select className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" name="gender" defaultValue={isGender(selectedGender) ? selectedGender : ""}>
            <option value="">All genders</option>
            {Object.values(Gender).map((gender) => (
              <option key={gender} value={gender}>{genderLabel(gender)}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-semibold text-forest-900">
          Cabin
          <select className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" name="cabin" defaultValue={selectedCabin ?? ""}>
            <option value="">All cabins</option>
            {cabins.map((cabin) => (
              <option key={cabin} value={cabin}>{cabin}</option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          <button className="rounded-md bg-forest-800 px-4 py-2 text-sm font-semibold text-white" type="submit">Filter</button>
          <a className={secondaryButtonClass} href="/cards">Reset</a>
        </div>
      </form>

      <p className="no-print mb-4 text-sm font-medium text-slate-600">Showing {campers.length} of {allCampers.length} active campers.</p>

      <div className="grid gap-5 lg:grid-cols-2 print:block">
        {campers.map((camper) => {
          const byPeriod = new Map(camper.registrations.map((registration) => [registration.period, registration]));
          return (
            <article key={camper.id} className="print-card rounded-lg border-2 border-forest-900 bg-white p-5 shadow-soft print:mb-5">
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-forest-700">Camp Walden Registration Card</p>
                  <h2 className="mt-1 text-2xl font-bold text-forest-900">{camper.firstName} {camper.lastName}</h2>
                  <p className="text-sm text-slate-600">Cabin {camper.cabin?.name ?? "-"} - {UNIT_LABEL[camper.unit]} - Swim {SWIM_CODE[camper.swimLevel]}</p>
                  {camper.medicalFlags ? <Badge tone="amber">{camper.medicalFlags}</Badge> : null}
                </div>
                <img alt={`QR for ${camper.firstName} ${camper.lastName}`} className="h-24 w-24" src={`/api/campers/${camper.id}/qr`} />
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 print:grid-cols-2">
                {[leftPeriods, rightPeriods].map((periods, index) => (
                  <table key={index} className="w-full table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="bg-forest-900 text-white">
                        <th className="w-12 border border-forest-900 p-2 text-left">Pd</th>
                        <th className="border border-forest-900 p-2 text-left">Activity</th>
                        <th className="w-14 border border-forest-900 p-2 text-left text-[10px] leading-tight">Approval</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((period) => {
                        const registration = byPeriod.get(period);
                        return (
                          <tr key={period}>
                            <td className="border border-slate-300 p-2 text-lg font-extrabold text-forest-900">{PERIOD_LABEL[period]}</td>
                            <td className="border border-slate-300 p-2 align-top text-base font-semibold leading-snug text-slate-900">{registration?.offering.activity.name ?? ""}</td>
                            <td className="border border-slate-300 p-1 align-top text-[10px] leading-tight text-slate-600">{registration?.counselorApproval ?? ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">ID: {camper.id}</p>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
