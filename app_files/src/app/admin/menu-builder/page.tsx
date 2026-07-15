import { LimitType, Period, Prisma, RegistrationRole, RegistrationStatus, SwimLevel, Unit, UserRole } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { activeCamperCount } from "@/lib/menu-builder-behavior";
import { readStringArray } from "@/lib/local-arrays";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { MenuBuilderClient } from "./menu-builder-client";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

type OfferingRow = Prisma.ActivityOfferingGetPayload<{
  include: {
    area: true;
    activity: { include: { requiredCertifications: true } };
    menuRows: true;
    registrations: { select: { registrationRole: true; status: true } };
    _count: { select: { staffAssignments: true } };
  };
}>;

export default async function MenuBuilderPage({
  searchParams
}: {
  searchParams?: Promise<{ sessionId?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const [allSessions, requestedSession] = await Promise.all([
    prisma.session.findMany({ select: { id: true, name: true, cycle: true, year: true, active: true }, orderBy: { createdAt: "desc" } }),
    params.sessionId ? prisma.session.findUnique({ where: { id: params.sessionId } }) : prisma.session.findFirst({ where: { active: true } })
  ]);
  const session = requestedSession;
  const [areas, activities, certifications, offerings] = await Promise.all([
    prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.activity.findMany({ where: { active: true, area: { active: true } }, include: { area: true }, orderBy: [{ area: { name: "asc" } }, { name: "asc" }] }),
    prisma.certification.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    session
      ? prisma.activityOffering.findMany({
          where: { sessionId: session.id },
          include: {
            area: true,
            activity: { include: { requiredCertifications: true } },
            menuRows: { orderBy: { sortOrder: "asc" } },
            registrations: {
              where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } },
              select: { registrationRole: true, status: true }
            },
            _count: { select: { staffAssignments: true } }
          },
          orderBy: [{ area: { name: "asc" } }, { period: "asc" }, { activity: { name: "asc" } }]
        })
      : Promise.resolve([] as OfferingRow[])
  ]);

  return (
    <AppShell user={user}>
      <PageHeader
        title="A/B Menu Builder"
        eyebrow={session ? `${session.name}${session.active ? " (active)" : " (not active — building ahead)"}` : "No session"}
        description="Create and adjust period offerings, limits, eligibility, staffing targets, and operating notes."
      >
        <Link className={secondaryButtonClass} href="/reports/ab-menu">Print A/B Menu</Link>
        <Link className={secondaryButtonClass} href="/reports/master-ab-menu">Master A/B Menu</Link>
      </PageHeader>

      {allSessions.length > 1 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="font-black text-slate-600">Editing:</span>
          {allSessions.map((s) => (
            <Link
              key={s.id}
              href={`/admin/menu-builder?sessionId=${s.id}`}
              className={`rounded-md border px-3 py-1.5 text-xs font-black ${session?.id === s.id ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {s.name} — {s.cycle} {s.year}{s.active ? " (active)" : ""}
            </Link>
          ))}
        </div>
      ) : null}
      {session && !session.active ? (
        <div className="mb-4 rounded-lg border border-lake-200 bg-lake-50 p-3 text-sm font-bold text-lake-900">
          You&apos;re editing {session.name}, which is not the active session — nothing here affects what other users see until it&apos;s switched on in Camp Structure.
        </div>
      ) : null}

      <MenuBuilderClient
        sessionId={session?.id ?? ""}
        areas={areas.map((area) => ({ id: area.id, name: area.name }))}
        activities={activities.map((activity) => ({ id: activity.id, areaId: activity.areaId, name: activity.name }))}
        certifications={certifications.map((certification) => ({ id: certification.id, name: certification.name }))}
        offerings={offerings.map((offering) => ({
          id: offering.id,
          period: offering.period,
          periodLabel: PERIOD_LABEL[offering.period],
          area: { id: offering.area.id, name: offering.area.name },
          activity: {
            id: offering.activity.id,
            name: offering.activity.name,
            requiredCertifications: offering.activity.requiredCertifications.map((certification) => ({ id: certification.id, name: certification.name }))
          },
          rosterLimit: offering.rosterLimit,
          limitType: offering.limitType,
          staffTarget: offering.staffTarget,
          active: offering.active,
          preAssigned: offering.preAssigned,
          spansTwoPeriods: offering.spansTwoPeriods,
          visibleForCamperRegistration: offering.visibleForCamperRegistration,
          allowOverride: offering.allowOverride,
          allowWaitlist: offering.allowWaitlist,
          visibleOnMenu: offering.visibleOnMenu,
          visibleOnMasterMenu: offering.visibleOnMasterMenu,
          includeInPrint: offering.includeInPrint,
          notes: offering.notes,
          eligibleUnits: readStringArray(offering.eligibleUnits),
          eligibleSwimLevels: readStringArray(offering.eligibleSwimLevels),
          camperCount: activeCamperCount(offering.registrations),
          staffCount: offering._count.staffAssignments,
          menuRows: offering.menuRows.map((row) => ({
            id: row.id,
            label: row.label,
            visible: row.visible,
            includeInPrint: row.includeInPrint
          }))
        }))}
        periodOptions={(Object.values(Period) as Period[]).map((period) => ({ value: period, label: PERIOD_LABEL[period] }))}
        unitOptions={(Object.values(Unit) as Unit[]).map((unit) => ({ value: unit, label: UNIT_LABEL[unit] }))}
        swimLevelOptions={(Object.values(SwimLevel) as SwimLevel[]).map((level) => ({ value: level, label: SWIM_LABEL[level] }))}
        limitTypeOptions={(Object.values(LimitType) as LimitType[]).map((limit) => ({ value: limit, label: limit.replaceAll("_", " ") }))}
        canEdit={user.role === UserRole.EXECUTIVE_ADMIN}
      />
    </AppShell>
  );
}
