import { RegistrationRole, RegistrationStatus, RegistrationWindow, UserRole, WeekBlock } from "@prisma/client";
import { CalendarDays, Filter } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { CounselorRegistration } from "@/components/counselor-registration";
import { Badge, secondaryButtonClass } from "@/components/ui";
import { canOverrideCapacity } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { camperPoolWhere, resolveCamperPoolFilters, WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_CODE, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { readStringArray } from "@/lib/local-arrays";
import { inferCurrentRegistrationWindow, parseRegistrationWindow, REGISTRATION_WINDOW_DESCRIPTION, REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const allWeekBlocks = Object.values(WeekBlock) as WeekBlock[];

type RegistrationSearchParams = {
  window?: string | string[];
  group?: string | string[];
  weekBlock?: string | string[];
  designation?: string | string[];
};

function genderLabel(gender: string) {
  return gender.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function RegistrationPage({ searchParams }: { searchParams?: Promise<RegistrationSearchParams> }) {
  const user = await requireUser();
  const session = await prisma.session.findFirst({ where: { active: true } });
  const params = searchParams ? await searchParams : {};
  const registrationWindow = parseRegistrationWindow(params.window, inferCurrentRegistrationWindow(session));

  const [filterGroups, designationRows] = session
    ? await Promise.all([
        prisma.camperFilterGroup.findMany({ where: { sessionId: session.id, active: true }, orderBy: { name: "asc" } }),
        prisma.camperSessionDesignation.findMany({
          where: { camper: { sessionId: session.id, active: true } },
          distinct: ["label"],
          orderBy: { label: "asc" }
        })
      ])
    : [[], []];
  const { selectedGroupIds, weekBlocks, designations } = resolveCamperPoolFilters(params, filterGroups);

  const [campers, offerings, cabins] = session
    ? await Promise.all([
        prisma.camper.findMany({
          where: { sessionId: session.id, active: true, ...camperPoolWhere({ weekBlocks, designations }) },
          include: { cabin: true, weekEnrollments: { include: { cabin: true }, orderBy: { weekBlock: "asc" } }, sessionDesignations: { orderBy: { label: "asc" } }, allergies: { include: { allergyLabel: true } } },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
        }),
        prisma.activityOffering.findMany({
          where: {
            sessionId: session.id,
            active: true,
            // NOTE: registration eligibility is governed by visibleForCamperRegistration
            // ONLY. A class can be registrable without appearing on the A/B menu
            // (visibleOnMenu) — e.g. Programming classes built for CAs that aren't
            // printed on the menu. Do not re-add visibleOnMenu here.
            visibleForCamperRegistration: true,
            area: { active: true },
            activity: { active: true }
          },
          include: {
            area: true,
            activity: true,
            _count: { select: { registrations: { where: { registrationWindow, registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } } } } }
          },
          orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
        }),
        prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] })
      ])
    : [[], [], []];

  return (
    <AppShell user={user}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-forest-900">Camper Registration</h1>
          <p className="mt-1 text-base text-slate-600">Search campers, choose an offering, and save counselor-approved registrations.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm"><CalendarDays className="h-4 w-4" />{session?.name ?? "No Session"} • {session?.year ?? "Year"}</span>
          <Badge tone="green">{user.name}</Badge>
        </div>
      </div>
      {!session ? (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          No active session is selected, so camper registration is not available yet.
        </div>
      ) : null}
      {session ? (
        <form className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-panel" method="get">
          <input name="window" type="hidden" value={registrationWindow} />
          <div className="mb-3 flex items-center gap-2">
            <Filter className="h-4 w-4 text-lake-700" />
            <h2 className="text-sm font-black uppercase tracking-wide text-forest-900">Registration Pool</h2>
            <Badge>{campers.length} campers visible</Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <fieldset>
              <legend className="mb-2 text-xs font-black text-slate-700">Saved groups</legend>
              <div className="flex flex-wrap gap-2">
                {filterGroups.map((group) => (
                  <label key={group.id} className="cursor-pointer">
                    <input className="peer sr-only" defaultChecked={selectedGroupIds.includes(group.id)} name="group" type="checkbox" value={group.id} />
                    <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{group.name}</span>
                  </label>
                ))}
                {!filterGroups.length ? <span className="text-sm font-semibold text-slate-500">No saved groups yet.</span> : null}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-black text-slate-700">Week blocks</legend>
              <div className="flex flex-wrap gap-2">
                {allWeekBlocks.map((weekBlock) => (
                  <label key={weekBlock} className="cursor-pointer">
                    <input className="peer sr-only" defaultChecked={weekBlocks.includes(weekBlock)} name="weekBlock" type="checkbox" value={weekBlock} />
                    <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{WEEK_BLOCK_LABEL[weekBlock]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-black text-slate-700">Session designations</legend>
              <div className="flex max-h-28 flex-wrap gap-2 overflow-auto">
                {designationRows.map((row) => (
                  <label key={row.label} className="cursor-pointer">
                    <input className="peer sr-only" defaultChecked={designations.includes(row.label)} name="designation" type="checkbox" value={row.label} />
                    <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white">{row.label}</span>
                  </label>
                ))}
                {!designationRows.length ? <span className="text-sm font-semibold text-slate-500">Import the expanded report to unlock designation filters.</span> : null}
              </div>
            </fieldset>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="inline-flex min-h-10 items-center justify-center rounded-lg bg-lake-600 px-4 text-sm font-black text-white" type="submit">Apply Pool</button>
            <a className={secondaryButtonClass} href={`/registration?window=${registrationWindow}`}>Clear Pool</a>
          </div>
        </form>
      ) : null}
      <CounselorRegistration
        canOverride={canOverrideCapacity(user.role)}
        canEditCampers={user.role === UserRole.EXECUTIVE_ADMIN}
        cabins={cabins.map((cabin) => ({ id: cabin.id, name: cabin.name, unit: cabin.unit }))}
        registrationWindow={registrationWindow}
        registrationWindows={Object.values(RegistrationWindow).map((window) => ({
          value: window,
          label: REGISTRATION_WINDOW_LABEL[window],
          description: REGISTRATION_WINDOW_DESCRIPTION[window]
        }))}
        campers={campers.map((camper) => ({
          id: camper.id,
          name: `${camper.firstName} ${camper.lastName}`,
          cabin: camper.cabin?.name ?? "No cabin",
          cabinId: camper.cabinId,
          weeks: camper.weekEnrollments.map((week) => `${WEEK_BLOCK_LABEL[week.weekBlock]}: ${week.cabin?.name ?? week.cabinName ?? "-"}`),
          unit: UNIT_LABEL[camper.unit],
          gender: genderLabel(camper.gender),
          swim: SWIM_CODE[camper.swimLevel],
          counselorAssistant: camper.counselorAssistant,
          medicalFlags: camper.medicalFlags
            ? camper.medicalFlags
            : camper.allergies.map((allergy) => allergy.allergyLabel.name).join(", ") || null
        }))}
        offerings={offerings.map((offering) => ({
          id: offering.id,
          period: PERIOD_LABEL[offering.period],
          activity: offering.activity.name,
          area: offering.area.name,
          count: offering._count.registrations,
          limit: offering.rosterLimit,
          limitType: offering.limitType,
          preAssigned: offering.preAssigned,
          allowWaitlist: offering.allowWaitlist,
          active: offering.active,
          eligibleUnits: readStringArray(offering.eligibleUnits).map((unit) => UNIT_LABEL[unit as keyof typeof UNIT_LABEL] ?? unit),
          eligibleSwimLevels: readStringArray(offering.eligibleSwimLevels).map((level) => SWIM_LABEL[level as keyof typeof SWIM_LABEL] ?? level)
        }))}
      />
    </AppShell>
  );
}
