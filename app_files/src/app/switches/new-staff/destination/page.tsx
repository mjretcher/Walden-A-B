import { UserRole } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";

export default async function StaffDestinationPage({
  searchParams
}: {
  searchParams?: Promise<{ assignmentId?: string; area?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const assignment = params.assignmentId
    ? await prisma.staffAssignment.findUnique({
        where: { id: params.assignmentId },
        include: { staff: { include: { primaryArea: { select: { name: true } } } }, offering: { include: { activity: true, area: true } } }
      })
    : null;

  if (!assignment) {
    return (
      <AppShell user={user}>
        <PageHeader title="Choose the destination" eyebrow="Step 2 of 3" />
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 shadow-soft">
          That assignment could not be found.{" "}
          <Link className="font-bold underline" href="/switches/new-staff">
            Start over
          </Link>
          .
        </div>
      </AppShell>
    );
  }

  const lockedPeriod = assignment.period;
  const offerings = await prisma.activityOffering.findMany({
    where: { sessionId: assignment.sessionId, period: lockedPeriod, active: true, area: { active: true }, activity: { active: true } },
    include: {
      activity: true,
      area: true,
      _count: { select: { staffAssignments: true } }
    },
    orderBy: [{ area: { name: "asc" } }, { activity: { name: "asc" } }]
  });

  const areaMap = new Map<string, string>();
  for (const offering of offerings) areaMap.set(offering.areaId, offering.area.name);
  const areas = Array.from(areaMap, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const selectedArea = params.area && areaMap.has(params.area) ? params.area : null;
  const visibleOfferings = selectedArea ? offerings.filter((offering) => offering.areaId === selectedArea) : offerings;

  function areaChipHref(areaId: string | null) {
    const search = new URLSearchParams({ assignmentId: assignment!.id });
    if (areaId) search.set("area", areaId);
    return `/switches/new-staff/destination?${search.toString()}`;
  }

  return (
    <AppShell user={user}>
      <PageHeader title="Choose the destination" eyebrow="Step 2 of 3 · Pick the new assignment" />

      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft">
        <span className="font-black uppercase tracking-wide text-forest-900">
          Moving: {assignment.staff.firstName} {assignment.staff.lastName}
        </span>
        {assignment.staff.primaryArea ? (
          <>
            <span className="text-slate-500">·</span>
            <span className="text-slate-600">{assignment.staff.primaryArea.name}</span>
          </>
        ) : null}
        <span className="text-slate-500">·</span>
        <span className="font-semibold text-slate-700">Period {PERIOD_LABEL[lockedPeriod]}</span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-600">
          currently {assignment.offering.area.name} — {assignment.offering.activity.name}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/switches/new-staff"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Change staff
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
            {visibleOfferings.map((offering) => {
              const isCurrent = offering.id === assignment.offeringId;
              const staffed = offering._count.staffAssignments;
              const understaffed = staffed < offering.staffTarget;
              return (
                <article key={offering.id} className={`flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-soft ${isCurrent ? "opacity-70" : ""}`}>
                  <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-lake-700">{offering.area.name}</p>
                  <h3 className="mt-0.5 text-base font-bold text-forest-900">{offering.activity.name}</h3>
                  <p className="text-xs font-semibold text-slate-500">Period {PERIOD_LABEL[offering.period]}</p>

                  <p className={`mt-3 text-sm font-semibold ${understaffed ? "text-amber-700" : "text-forest-800"}`}>
                    Staffed: {staffed} of target {offering.staffTarget}
                  </p>

                  <div className="mt-3 flex flex-1 items-end">
                    {isCurrent ? (
                      <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">Current assignment</span>
                    ) : (
                      <Link
                        href={`/switches/new-staff/confirm?assignmentId=${assignment.id}&offeringId=${offering.id}`}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-lake-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-lake-700"
                      >
                        Select <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-8 text-center">
          <p className="text-lg font-semibold text-forest-900">No active offerings available for period {PERIOD_LABEL[lockedPeriod]}.</p>
          <Link className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-lake-700 hover:underline" href="/switches/new-staff">
            <ArrowLeft className="h-4 w-4" /> Back to staff search
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
