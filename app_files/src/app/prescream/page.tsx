import { Period, UserRole } from "@prisma/client";
import { AlertTriangle, Users, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, PageHeader } from "@/components/ui";
import { ConfirmSubmitButton, SubmitButton } from "@/components/confirm-submit-button";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, STAFF_PERIODS } from "@/lib/periods";
import { openConflictsWithHolders } from "@/lib/prescream";
import { deletePreScreamConflict, preScreamAssign, preScreamRelease, resetPreScream, resolvePreScreamConflict, togglePreScreamOpen, withdrawPreScreamClaim } from "./actions";

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

  // Every current assignment across ALL areas (not just viewArea) for the
  // periods this area actually has offerings in — lets the picker show
  // "already on Waterfront for Sailing" before an area head picks someone,
  // instead of only finding out after creating a formal conflict. This is
  // what makes a casual "hey, can I borrow Sam for 3A" conversation
  // possible before anything gets contested in the system.
  const relevantPeriods = Array.from(new Set(offerings.map((o) => o.period)));
  const statusByStaffPeriod = new Map<string, { areaName: string; activityName: string; pickedByName: string | null }>();
  if (viewArea && relevantPeriods.length) {
    const allAssignments = await prisma.staffAssignment.findMany({
      where: { sessionId: session.id, period: { in: relevantPeriods } },
      include: {
        offering: { select: { area: { select: { name: true } }, activity: { select: { name: true } } } },
        createdBy: { select: { name: true } }
      }
    });
    for (const a of allAssignments) {
      statusByStaffPeriod.set(`${a.staffId}:${a.period}`, {
        areaName: a.offering.area.name,
        activityName: a.offering.activity.name,
        pickedByName: a.createdBy?.name ?? null
      });
    }
  }

  // Plain alphabetical — the per-offering picker below does its own sort
  // (busy-staff-to-the-bottom) on top of this, so this only needs to be a
  // stable starting order, not carry any priority logic itself.
  const sortedStaff = viewArea ? [...eligibleStaff].sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)) : [];

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
          <div className="flex flex-wrap items-center gap-2">
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
            {allConflicts.length > 0 && (
              <form action={resetPreScream}>
                <input name="sessionId" type="hidden" value={session.id} />
                <ConfirmSubmitButton
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-800 hover:bg-red-100"
                  confirmMessage={`Delete all ${allConflicts.length} PreScream conflict(s) for ${session.name}? This clears the conflict tracking completely — it does NOT undo any real staff assignments, only the contested-pick bookkeeping. This cannot be undone.`}
                >
                  Delete all conflicts
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
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
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-black text-forest-900">
                    {conflict.staff.firstName} {conflict.staff.lastName} &middot; {PERIOD_LABEL[conflict.period]}
                  </p>
                  {isExecAdmin && (
                    <form action={deletePreScreamConflict}>
                      <input name="conflictId" type="hidden" value={conflict.id} />
                      <ConfirmSubmitButton
                        className="text-xs font-semibold text-slate-400 underline hover:text-red-600"
                        confirmMessage="Delete this conflict without picking a winner? The current holder keeps their assignment; the other claim(s) are discarded."
                      >
                        Dismiss
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {conflict.holderAreaName ? (
                    <>Currently holding: {conflict.holderAreaName}{conflict.holderPickedByName ? ` (picked by ${conflict.holderPickedByName})` : ""}</>
                  ) : (
                    "Nobody currently holds this slot"
                  )}{" "}
                  &middot; wanted by {1 + conflict.claims.length} area{conflict.claims.length ? "s" : ""}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {conflict.holder && (
                    <form action={resolvePreScreamConflict}>
                      <input name="conflictId" type="hidden" value={conflict.id} />
                      <input name="winningOfferingId" type="hidden" value={conflict.holder.offeringId} />
                      <SubmitButton className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm font-bold hover:bg-forest-50" pendingLabel="Assigning…">
                        <span className="block text-xs text-slate-400">{conflict.holderAreaName}{conflict.holderPickedByName ? ` — ${conflict.holderPickedByName}` : ""}</span>
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
                          <span className="block text-xs text-slate-400">{claim.area.name}{claim.claimedBy?.name ? ` — ${claim.claimedBy.name}` : ""}</span>
                          {claim.offering.activity.name}
                        </SubmitButton>
                      ) : (
                        <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">
                          <span className="block text-xs text-slate-400">{claim.area.name}{claim.claimedBy?.name ? ` — ${claim.claimedBy.name}` : ""}</span>
                          {claim.offering.activity.name}
                        </div>
                      )}
                      {(isExecAdmin || claim.areaId === user.areaId) && (
                        <button
                          className="mt-1 text-xs font-semibold text-slate-400 underline hover:text-red-600"
                          formAction={withdrawPreScreamClaim}
                          name="claimId"
                          type="submit"
                          value={claim.id}
                        >
                          Withdraw this claim
                        </button>
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
                    // Full list now, not just the first — PreScream is
                    // deliberately unlimited (most classes genuinely need
                    // 2+ staff, and this is meant for area heads to try
                    // combinations before Scream Session, not to enforce a
                    // final headcount).
                    const holders = offering.staffAssignments;
                    const holderStaffIds = new Set(holders.map((h) => h.staff.id));
                    const pendingClaims = allConflicts
                      .filter((c) => c.period === period)
                      .flatMap((c) => c.claims.filter((claim) => claim.offeringId === offering.id).map((claim) => ({ conflict: c, claim })));
                    return (
                      <div key={offering.id} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-forest-900">{offering.activity.name}</p>
                          {holders.length === 0 && pendingClaims.length === 0 && <p className="text-xs text-slate-400">Needs staff</p>}
                        </div>

                        {holders.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {holders.map((holder) => (
                              <span key={holder.id} className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 py-1.5 pl-3 pr-1.5 text-sm font-black text-teal-800">
                                {holder.staff.firstName} {holder.staff.lastName}
                                {canAct && (
                                  <form action={preScreamRelease} className="contents">
                                    <input name="assignmentId" type="hidden" value={holder.id} />
                                    <button aria-label={`Release ${holder.staff.firstName} ${holder.staff.lastName}`} className="grid h-4 w-4 place-items-center rounded-full text-teal-700 hover:bg-teal-100 hover:text-red-600" title="Release" type="submit">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </form>
                                )}
                              </span>
                            ))}
                          </div>
                        )}

                        {pendingClaims.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {pendingClaims.map(({ conflict, claim }) => (
                              <form key={claim.id} action={withdrawPreScreamClaim} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 py-1.5 pl-3 pr-1.5 text-xs font-black text-amber-800">
                                {conflict.staff.firstName} {conflict.staff.lastName} — contested
                                {(isExecAdmin || claim.areaId === user.areaId) && (
                                  <>
                                    <input name="claimId" type="hidden" value={claim.id} />
                                    <button aria-label={`Withdraw claim on ${conflict.staff.firstName} ${conflict.staff.lastName}`} className="grid h-4 w-4 place-items-center rounded-full text-amber-700 hover:bg-amber-100 hover:text-red-600" title="Withdraw this claim" type="submit">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </>
                                )}
                              </form>
                            ))}
                          </div>
                        )}

                        {canAct ? (
                          <form action={preScreamAssign} className="mt-2 flex flex-wrap items-center gap-2">
                            <input name="offeringId" type="hidden" value={offering.id} />
                            <input name="period" type="hidden" value={period} />
                            <select className="min-w-[220px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" defaultValue="" name="staffId" required>
                              <option disabled value="">{holders.length ? "Add another…" : "Search staff…"}</option>
                              {sortedStaff
                                .filter((staff) => !holderStaffIds.has(staff.id))
                                .map((staff) => ({ staff, status: statusByStaffPeriod.get(`${staff.id}:${period}`) ?? null }))
                                .sort((a, b) => {
                                  // Alphabetical throughout, with one exception: anyone
                                  // already busy this period (here or elsewhere) sorts
                                  // to the bottom, alphabetical among themselves too —
                                  // still pickable (that's what starts a conflict), just
                                  // out of the way of the people actually free to grab.
                                  const aBusy = a.status ? 1 : 0;
                                  const bBusy = b.status ? 1 : 0;
                                  if (aBusy !== bBusy) return aBusy - bBusy;
                                  return `${a.staff.lastName} ${a.staff.firstName}`.localeCompare(`${b.staff.lastName} ${b.staff.firstName}`);
                                })
                                .map(({ staff, status }) => (
                                  <option key={staff.id} value={staff.id}>
                                    {staff.firstName} {staff.lastName}
                                    {status
                                      ? status.areaName === viewArea.name
                                        ? ` — already here: ${status.activityName}`
                                        : ` — busy: ${status.areaName} (${status.activityName})${status.pickedByName ? `, ${status.pickedByName}` : ""}`
                                      : ""}
                                  </option>
                                ))}
                            </select>
                            <SubmitButton className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold hover:bg-forest-50" pendingLabel="…">{holders.length ? "Add" : "Pick"}</SubmitButton>
                          </form>
                        ) : holders.length === 0 && pendingClaims.length === 0 ? (
                          <p className="mt-2 text-xs font-medium text-slate-400">PreScream closed</p>
                        ) : null}
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
