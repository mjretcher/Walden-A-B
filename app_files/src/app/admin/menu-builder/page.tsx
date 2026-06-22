import { LimitType, Period, Prisma, RegistrationRole, RegistrationStatus, SwimLevel, Unit, UserRole } from "@prisma/client";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { activeCamperCount } from "@/lib/menu-builder-behavior";
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

export default async function MenuBuilderPage() {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const session = await prisma.session.findFirst({ where: { active: true } });
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
        eyebrow={session?.name ?? "No active session"}
        description="Create and adjust period offerings, limits, eligibility, staffing targets, and operating notes."
      >
        <Link className={secondaryButtonClass} href="/reports/ab-menu">Print A/B Menu</Link>
        <Link className={secondaryButtonClass} href="/reports/master-ab-menu">Master A/B Menu</Link>
      </PageHeader>

      <MenuBuilderClient
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
          visibleForCamperRegistration: offering.visibleForCamperRegistration,
          allowOverride: offering.allowOverride,
          visibleOnMenu: offering.visibleOnMenu,
          visibleOnMasterMenu: offering.visibleOnMasterMenu,
          includeInPrint: offering.includeInPrint,
          notes: offering.notes,
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
