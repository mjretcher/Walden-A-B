import { LimitType, RegistrationRole, RegistrationStatus, UserRole } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { OfferingCard, type OfferingCardData } from "@/components/switches/offering-card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { computeOfferingVerdict } from "@/lib/switch-eligibility";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

export default async function DestinationStepPage({
  searchParams
}: {
  searchParams?: Promise<{ registrationId?: string; area?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const registrationId = params.registrationId;

  const registration = registrationId
    ? await prisma.registration.findFirst({
        where: { id: registrationId, status: { in: activeRegistration } },
        include: { camper: true, offering: { include: { activity: true, area: true } } }
      })
    : null;

  if (!registration) {
    return (
      <AppShell user={user}>
        <PageHeader title="Choose the destination" eyebrow="Step 2 of 3" />
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 shadow-soft">
          That registration could not be found. It may have already been switched.{" "}
          <Link className="font-bold underline" href="/switches/new">
            Start over
          </Link>
          .
        </div>
      </AppShell>
    );
  }

  const { camper } = registration;
  const lockedPeriod = registration.period;

  const offerings = await prisma.activityOffering.findMany({
    where: {
      sessionId: registration.sessionId,
      period: lockedPeriod,
      active: true,
      visibleForCamperRegistration: true,
      area: { active: true },
      activity: { active: true }
    },
    include: {
      activity: true,
      area: true,
      staffAssignments: { include: { staff: { select: { firstName: true, lastName: true } } } },
      _count: { select: { registrations: { where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } } } } }
    },
    orderBy: [{ area: { name: "asc" } }, { activity: { name: "asc" } }]
  });

  // Area filter chips — only areas that actually have offerings this period.
  const areaMap = new Map<string, string>();
  for (const offering of offerings) areaMap.set(offering.areaId, offering.area.name);
  const areas = Array.from(areaMap, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const selectedArea = params.area && areaMap.has(params.area) ? params.area : null;
  const visibleOfferings = selectedArea ? offerings.filter((offering) => offering.areaId === selectedArea) : offerings;

  function toCardData(offering: (typeof offerings)[number]): OfferingCardData {
    return {
      offeringId: offering.id,
      registrationId: registration!.id,
      areaName: offering.area.name,
      activityName: offering.activity.name,
      periodLabel: PERIOD_LABEL[offering.period],
      enrollmentCount: offering._count.registrations,
      rosterLimit: offering.rosterLimit,
      limitType: offering.limitType,
      staffNames: offering.staffAssignments.map((assignment) => `${assignment.staff.firstName} ${assignment.staff.lastName}`),
      verdict: computeOfferingVerdict({
        camperFirstName: camper.firstName,
        camperUnit: camper.unit,
        camperSwimLevel: camper.swimLevel,
        counselorAssistant: camper.counselorAssistant,
        offering,
        enrollmentCount: offering._count.registrations,
        isCurrent: offering.id === registration!.offeringId,
        role: user.role
      })
    };
  }

  const cards: OfferingCardData[] = visibleOfferings.map(toCardData);

  // "Would also fit" — when some offerings this period are at/over capacity,
  // surface up to 3 eligible-with-space alternatives in the same area or
  // activity as a full one (spec §3 Step 2).
  const isAtCapacity = (offering: (typeof offerings)[number]) =>
    offering.limitType !== LimitType.UNLIMITED && offering.rosterLimit != null && offering._count.registrations >= offering.rosterLimit;
  const fullAreaIds = new Set(offerings.filter(isAtCapacity).map((offering) => offering.areaId));
  const fullActivityNames = new Set(offerings.filter(isAtCapacity).map((offering) => offering.activity.name));
  const alternatives = offerings
    .filter((offering) => offering.id !== registration.offeringId && !isAtCapacity(offering))
    .filter((offering) => fullAreaIds.has(offering.areaId) || fullActivityNames.has(offering.activity.name))
    .map(toCardData)
    .filter((card) => card.verdict.tone === "ok")
    .slice(0, 3);

  function areaChipHref(areaId: string | null) {
    const search = new URLSearchParams({ registrationId: registration!.id });
    if (areaId) search.set("area", areaId);
    return `/switches/new/destination?${search.toString()}`;
  }

  return (
    <AppShell user={user}>
      <PageHeader title="Choose the destination" eyebrow="Step 2 of 3 · Pick the new offering" />

      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft">
        <span className="font-black uppercase tracking-wide text-forest-900">
          Moving: {camper.firstName} {camper.lastName}
        </span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-600">{UNIT_LABEL[camper.unit]}</span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-600">{SWIM_LABEL[camper.swimLevel]}</span>
        <span className="text-slate-500">·</span>
        <span className="font-semibold text-slate-700">Period {PERIOD_LABEL[lockedPeriod]}</span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-600">
          currently {registration.offering.area.name} — {registration.offering.activity.name}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/switches/new"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Change camper
        </Link>
      </div>

      {offerings.length ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by area">
            <AreaChip label="All" href={areaChipHref(null)} active={!selectedArea} />
            {areas.map((area) => (
              <AreaChip key={area.id} label={area.name} href={areaChipHref(area.id)} active={selectedArea === area.id} />
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <OfferingCard key={card.offeringId} data={card} />
            ))}
          </div>

          {alternatives.length ? (
            <div className="mt-8">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Would also fit — open spots</h2>
              <p className="mt-1 text-sm text-slate-500">
                Some classes this period are full. These eligible options in the same area or activity still have room.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {alternatives.map((card) => (
                  <Link
                    key={card.offeringId}
                    href={`/switches/new/confirm?registrationId=${registration.id}&offeringId=${card.offeringId}`}
                    className="rounded-xl border border-forest-200 bg-forest-50/50 p-3 transition hover:border-forest-300 hover:bg-forest-50"
                  >
                    <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-lake-700">{card.areaName}</p>
                    <p className="text-sm font-bold text-forest-900">
                      {card.activityName} · {card.periodLabel}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-forest-700">
                      {card.enrollmentCount}
                      {card.rosterLimit != null ? ` / ${card.rosterLimit}` : ""} · ✅ {card.verdict.label}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center">
          <p className="text-lg font-semibold text-forest-900">No active offerings available for period {PERIOD_LABEL[lockedPeriod]}.</p>
          <Link className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-lake-700 hover:underline" href="/switches/new">
            <ArrowLeft className="h-4 w-4" /> Back to camper search
          </Link>
        </div>
      )}
    </AppShell>
  );
}

function AreaChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={`min-h-9 rounded-full px-3 py-1.5 text-sm font-bold transition ${
        active ? "bg-forest-700 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}
