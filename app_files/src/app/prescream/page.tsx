import { Period, UserRole } from "@prisma/client";
import { AlertTriangle, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader } from "@/components/ui";
import { ConfirmSubmitButton, SubmitButton } from "@/components/confirm-submit-button";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";
import { openConflictsWithHolders } from "@/lib/prescream";
import { preScreamAssign, preScreamRelease, resolvePreScreamConflict, togglePreScreamOpen } from "./actions";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "PreScream" };

export default async function PreScreamPage({ searchParams }: { searchParams?: Promise<{ areaId?: string }> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const isExecAdmin = user.role === UserRole.EXECUTIVE_ADMIN;

  const session = await prisma.session.findFirst({ where: { active: true } });
  if (!session) {
    return (
      <AppShell user={user}>
        <PageHeader title="PreScream" eyebrow="Scream Session" description="No active session." />
      </AppShell>
    );
  }

  const [allConflicts, allAreas] = await Promise.all([
    openConflictsWithHolders(session.id),
    isExecAdmin ? prisma.area.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : Promise.resolve([])
  ]);

  const myConflicts = isExecAdmin
    ? allConflicts
    : allConflicts.filter((c) => c.holderAreaId === user.areaId || c.claims.some((claim) => claim.areaId === user.areaId));

  // Area heads only ever see their own area. Exec Admins pick one via
  // ?areaId= — defaulting to none shown, since their primary job here is
  // the conflicts list, not running any one area's picker.
  const viewAreaId = isExecAdmin ? (params.areaId || null) : user.areaId;
  const viewArea = viewAreaId ? await prisma.area.findUnique({ where: { id: viewAreaId }, select: { id: true, name: true } }) : null;

  const canAct = isExecAdmin || Boolean(session.preScreamOpen);

  const [offerings, eligibleStaff] = viewArea
    ? await Promise.all([
        prisma.activityOffering.findMany({
          where: { sessionId: session.id, areaId: viewArea.id, active: true, activity: { active: true } },
          include: {
            activity: { select: { name: true } },
            staffAssignments: { include: { staff: { select: { id: true, firstName: true, lastName: true } } } }
          },
          orderBy: [{ period: "asc" }, { activity: { name: "asc" } }]
        }),
        prisma.staff.findMany({
          where: { active: true, screamEligible: true },
          select: { id: true, firstName: true, lastName: true, primaryAreaId: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }]
        })
      ])
    : [[], []];

  // Area's own staff sort first in the picker, matching the same "your own
  // people first" logic used for suggestions on the live Scream Session
  // board — falls back to alphabetical for everyone else.
  const sortedStaff = viewArea
    ? [...eligibleStaff].sort((a, b) => {
        const aOwn = a.primaryAreaId === viewArea.id;
        const bOwn = b.primaryAreaId === viewArea.id;
        if (aOwn !== bOwn) return aOwn ? -1 : 1;
        return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
      })
    : [];

  const offeringsByPeriod = new Map<Period, typeof offerings>();
  for (const offering of offerings) {
    const list = offeringsByPeriod.get(offering.period) ?? [];
    list.push(offering);
    offeringsByPeriod.set(offering.period, list);
  }
  const filledCount = offerings.filter((o) => o.staffAssignments.length > 0).length;

  return (
    <AppShell user={user}>
      <PageHeader
        title="PreScream"
        eyebrow="Scream Session"
        description="Pick staff for your area ahead of Scream Session. Nothing here changes how the live board works — it just gets a head start on it."
      >
        {isExecAdmin && (
          <form action={togglePreScreamOpen}>
            <input name="sessionId" type="hidden" value={session.id} />
            <input name="open" type="hidden" value={session.preScreamOpen ? "false" : "true"} />
            <ConfirmSubmitButton
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-forest-800 hover:bg-forest-50"
              confirmMessage={session.preScreamOpen ? "Close PreScream? Area heads will no longer be able to pick or release staff." : "Open PreScream for area heads?"}
            >
              {session.preScreamOpen ? "Close PreScream" : "Open PreScream"}
            </ConfirmSubmitButton>
          </form>
        )}
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {session.preScreamOpen ? <Badge tone="green">PreScream open</Badge> : <Badge tone="neutral">PreScream closed</Badge>}
        {!isExecAdmin && !session.preScreamOpen && (
          <span className="text-sm font-medium text-slate-500">Waiting on Exec Admin to open PreScream before you can pick or release staff.</span>
        )}
      </div>

      {/* Conflicts */}
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-800" />
          <h2 className="text-sm font-black uppercase tracking-wide text-amber-900">
            {isExecAdmin ? "Conflicts to resolve" : "Your conflicts"} ({myConflicts.length})
          </h2>
        </div>
        {myConflicts.length === 0 ? (
          <p className="mt-2 text-sm text-amber-800">No open conflicts{isExecAdmin ? "" : " involving your area"} right now.</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {myConflicts.map((conflict) => (
              <div key={conflict.id} className="rounded-lg border border-amber-300 bg-white p-4">
                <p className="text-sm font-black text-forest-900">
                  {conflict.staff.firstName} {conflict.staff.lastName} &middot; {PERIOD_LABEL[conflict.period]}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {conflict.holderAreaName ? `Currently holding: ${conflict.holderAreaName}` : "Nobody currently holds this slot"} &middot; wanted by {1 + conflict.claims.length} area{conflict.claims.length ? "s" : ""}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {conflict.holder && (
                    <form action={resolvePreScreamConflict}>
                      <input name="conflictId" type="hidden" value={conflict.id} />
                      <input name="winningOfferingId" type="hidden" value={conflict.holder.offeringId} />
                      <SubmitButton className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm font-bold hover:bg-forest-50" pendingLabel="Assigning…">
                        <span className="block text-xs text-slate-400">{conflict.holderAreaName}</span>
                        Keep current
                      </SubmitButton>
                    </form>
                  )}
                  {conflict.claims.map((claim) => (
                    <form key={claim.id} action={resolvePreScreamConflict}>
                      <input name="conflictId" type="hidden" value={conflict.id} />
                      <input name="winningOfferingId" type="hidden" value={claim.offeringId} />
                      {isExecAdmin ? (
                        <SubmitButton className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm font-bold hover:bg-forest-50" pendingLabel="Assigning…">
                          <span className="block text-xs text-slate-400">{claim.area.name}</span>
                          {claim.offering.activity.name}
                        </SubmitButton>
                      ) : (
                        <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">
                          <span className="block text-xs text-slate-400">{claim.area.name}</span>
                          {claim.offering.activity.name}
                        </div>
                      )}
                    </form>
                  ))}
                </div>
                {!isExecAdmin && <p className="mt-2 text-xs text-slate-400">Only Exec Admin can resolve this — flagged for Scream Session.</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Area picker */}
      {isExecAdmin && (
        <form className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-soft" method="get">
          <span className="text-sm font-black text-forest-900">View area</span>
          <select className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" defaultValue={viewAreaId ?? ""} name="areaId">
            <option value="">Choose an area…</option>
            {allAreas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
          <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold hover:bg-forest-50" type="submit">Go</button>
        </form>
      )}

      {viewArea && (
        <div className="rounded-xl border border-white bg-white p-5 shadow-soft">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-lake-700" />
              <h2 className="text-lg font-black text-forest-900">{viewArea.name}</h2>
            </div>
            <Badge tone={filledCount === offerings.length ? "green" : "amber"}>{filledCount} of {offerings.length} filled</Badge>
          </div>

          <div className="grid gap-4">
            {STAFF_PERIODS.filter((period) => offeringsByPeriod.has(period)).map((period) => (
              <div key={period}>
                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">{PERIOD_LABEL[period]}</p>
                <div className="grid gap-2">
                  {(offeringsByPeriod.get(period) ?? []).map((offering) => {
                    const holder = offering.staffAssignments[0] ?? null;
                    const hasOpenConflict = allConflicts.some((c) => c.period === period && (c.holderAreaId === viewArea.id || c.claims.some((claim) => claim.areaId === viewArea.id)) && offering.staffAssignments.length === 0 && c.claims.some((claim) => claim.offeringId === offering.id));
                    return (
                      <div key={offering.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                        <div>
                          <p className="text-sm font-bold text-forest-900">{offering.activity.name}</p>
                          {!holder && <p className="text-xs text-slate-400">Needs staff</p>}
                        </div>
                        {holder ? (
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-teal-50 px-3 py-1.5 text-sm font-black text-teal-800">{holder.staff.firstName} {holder.staff.lastName}</span>
                            {canAct && (
                              <form action={preScreamRelease}>
                                <input name="assignmentId" type="hidden" value={holder.id} />
                                <button className="text-xs font-semibold text-slate-400 underline" type="submit">Release</button>
                              </form>
                            )}
                          </div>
                        ) : hasOpenConflict ? (
                          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800">Claimed — pending resolution</span>
                        ) : canAct ? (
                          <form action={preScreamAssign} className="flex items-center gap-2">
                            <input name="offeringId" type="hidden" value={offering.id} />
                            <input name="period" type="hidden" value={period} />
                            <select className="min-w-[180px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" defaultValue="" name="staffId" required>
                              <option disabled value="">Search staff…</option>
                              {sortedStaff.map((staff) => (
                                <option key={staff.id} value={staff.id}>{staff.firstName} {staff.lastName}</option>
                              ))}
                            </select>
                            <SubmitButton className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold hover:bg-forest-50" pendingLabel="…">Pick</SubmitButton>
                          </form>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">PreScream closed</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
