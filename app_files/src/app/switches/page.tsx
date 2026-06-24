import { RegistrationRole, RegistrationStatus, SwitchStatus, SwitchType, UserRole } from "@prisma/client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Field, PageHeader, Panel, SectionHeader, StatCard, buttonClass, inputClass } from "@/components/ui";
import { PendingSwitchCard, type PendingSwitchCardData } from "@/components/switches/pending-switch-card";
import type { SwitchImpactSide } from "@/components/switches/switch-impact-panel";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CAMPER_PERIODS, PERIOD_LABEL, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { departureNote } from "@/lib/week-enrollment";
import { createCamperSwitch, createStaffSwitch, decideSwitch } from "./actions";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

function relativeTime(date: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function staffNames(assignments: { staff: { firstName: string; lastName: string } }[]): string {
  if (!assignments.length) return "No staff assigned";
  return assignments.map((assignment) => `${assignment.staff.firstName} ${assignment.staff.lastName}`).join(", ");
}

export default async function SwitchesPage({
  searchParams
}: {
  searchParams?: Promise<{
    toast?: string;
    name?: string;
    area?: string;
    type?: string;
    status?: string;
    period?: string;
    areaId?: string;
  }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};
  const toast =
    params.toast === "submitted" && params.name
      ? `Switch request created for ${params.name} — pending ${params.area ? `${params.area} ` : ""}area head review.`
      : params.toast === "approved" && params.name
        ? `Switch approved and applied immediately for ${params.name}.`
        : null;
  const session = await prisma.session.findFirst({ where: { active: true } });
  const [registrations, assignments, offerings, switches] = session
    ? await Promise.all([
        prisma.registration.findMany({
          where: { sessionId: session.id, status: { in: activeRegistration } },
          include: { camper: { include: { cabin: true } }, offering: { include: { activity: true, area: true } } },
          orderBy: [{ period: "asc" }]
        }),
        prisma.staffAssignment.findMany({
          where: { sessionId: session.id },
          include: { staff: true, offering: { include: { activity: true, area: true } } },
          orderBy: [{ period: "asc" }]
        }),
        prisma.activityOffering.findMany({
          where: {
            sessionId: session.id,
            active: true,
            areaId: user.role === UserRole.AREA_HEAD && user.areaId ? user.areaId : undefined,
            area: { active: true },
            activity: { active: true }
          },
          include: { activity: true, area: true },
          orderBy: [{ period: "asc" }, { area: { name: "asc" } }, { activity: { name: "asc" } }]
        }),
        prisma.switchRequest.findMany({
          where: { sessionId: session.id },
          include: {
            camper: { include: { cabin: true, weekEnrollments: true } },
            staff: true,
            currentOffering: {
              include: {
                activity: true,
                area: true,
                staffAssignments: { include: { staff: true } },
                _count: { select: { registrations: { where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } } } } }
              }
            },
            requestedOffering: {
              include: {
                activity: true,
                area: true,
                staffAssignments: { include: { staff: true } },
                _count: { select: { registrations: { where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } } } } }
              }
            },
            decidedBy: { select: { name: true } }
          },
          orderBy: { createdAt: "desc" }
        })
      ])
    : [[], [], [], []];

  const pendingSwitches = switches.filter((request) => request.status === SwitchStatus.PENDING);
  const approvedSwitches = switches.filter((request) => request.status === SwitchStatus.APPROVED);
  const deniedSwitches = switches.filter((request) => request.status === SwitchStatus.DENIED);
  const camperOfferings = offerings.filter((offering) => offering.visibleForCamperRegistration);
  const canCreateCamperSwitch = registrations.length > 0 && camperOfferings.length > 0;
  const canCreateStaffSwitch = assignments.length > 0 && offerings.length > 0;

  type SwitchRecord = (typeof switches)[number];
  type SwitchOffering = NonNullable<SwitchRecord["requestedOffering"]>;

  // Area heads can only act on switches routed into their own area; exec admins
  // can decide on any pending request.
  function canDecide(request: SwitchRecord): boolean {
    if (user.role === UserRole.EXECUTIVE_ADMIN) return true;
    if (user.role === UserRole.AREA_HEAD && user.areaId) {
      return request.requestedOffering?.areaId === user.areaId;
    }
    return false;
  }

  function buildSide(kind: "leaving" | "joining", offering: SwitchOffering | null, type: SwitchType): SwitchImpactSide {
    const isCamper = type === SwitchType.CAMPER;
    const metricLabel = isCamper ? "Enrollment" : "Staffed";
    if (!offering) {
      return { kind, areaName: "—", activityName: "—", periodLabel: "—", metricLabel, before: 0, after: 0, staff: "—" };
    }
    const before = isCamper ? offering._count.registrations : offering.staffAssignments.length;
    const after = kind === "leaving" ? before - 1 : before + 1;
    const limit = isCamper ? offering.rosterLimit : offering.staffTarget;
    const capacityNote = isCamper
      ? (offering.rosterLimit ? `of ${offering.rosterLimit} max` : null)
      : `target ${offering.staffTarget}`;

    let countTone: SwitchImpactSide["countTone"] = "ok";
    if (kind === "joining" && limit != null) {
      if (after > limit) countTone = "over";
      else if (after === limit) countTone = "warn";
    } else if (kind === "leaving" && !isCamper && after < offering.staffTarget) {
      countTone = "warn";
    }

    return {
      kind,
      areaName: offering.area.name,
      activityName: offering.activity.name,
      periodLabel: `Period ${PERIOD_LABEL[offering.period]}`,
      metricLabel,
      before,
      after,
      capacityNote,
      countTone,
      staff: staffNames(offering.staffAssignments),
      staffWarn: offering.staffAssignments.length === 0
    };
  }

  function toPendingCardData(request: SwitchRecord): PendingSwitchCardData {
    const { camper, staff } = request;
    const personName = camper
      ? `${camper.firstName} ${camper.lastName}`
      : staff
        ? `${staff.firstName} ${staff.lastName}`
        : "Unknown person";

    return {
      id: request.id,
      typeLabel: request.type === SwitchType.CAMPER ? "Camper Switch" : "Staff Switch",
      periodLabel: PERIOD_LABEL[request.period],
      requestedBy: request.requestedBy,
      createdAtLabel: relativeTime(request.createdAt),
      fromAreaName: request.currentOffering?.area.name ?? null,
      reason: request.reason,
      person: {
        name: personName,
        cabinName: camper?.cabin?.name ?? null,
        unitLabel: camper ? UNIT_LABEL[camper.unit] : null,
        swimLabel: camper ? SWIM_LABEL[camper.swimLevel] : null,
        departureNote: camper ? departureNote(camper.weekEnrollments) : null
      },
      leaving: buildSide("leaving", request.currentOffering, request.type),
      joining: buildSide("joining", request.requestedOffering, request.type)
    };
  }

  // --- History table filters (URL params, bookmarkable) ---
  const isExec = user.role === UserRole.EXECUTIVE_ADMIN;
  const typeFilter = params.type === "CAMPER" || params.type === "STAFF" ? params.type : null;
  const statusFilter =
    params.status === "PENDING" || params.status === "APPROVED" || params.status === "DENIED" ? params.status : null;
  const periodFilter = CAMPER_PERIODS.includes(params.period as never) ? (params.period as (typeof CAMPER_PERIODS)[number]) : null;

  // Area options derived from areas that actually appear in this session's history.
  const areaOptionMap = new Map<string, string>();
  for (const request of switches) {
    if (request.requestedOffering) areaOptionMap.set(request.requestedOffering.areaId, request.requestedOffering.area.name);
  }
  const areaOptions = Array.from(areaOptionMap, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const areaFilter = isExec && params.areaId && areaOptionMap.has(params.areaId) ? params.areaId : null;

  const filteredSwitches = switches.filter((request) => {
    if (typeFilter && request.type !== typeFilter) return false;
    if (statusFilter && request.status !== statusFilter) return false;
    if (periodFilter && request.period !== periodFilter) return false;
    if (areaFilter && request.requestedOffering?.areaId !== areaFilter) return false;
    return true;
  });

  function historyHref(overrides: { type?: string | null; status?: string | null; period?: string | null; areaId?: string | null }) {
    const next = new URLSearchParams();
    const type = "type" in overrides ? overrides.type : typeFilter;
    const status = "status" in overrides ? overrides.status : statusFilter;
    const period = "period" in overrides ? overrides.period : periodFilter;
    const areaId = "areaId" in overrides ? overrides.areaId : areaFilter;
    if (type) next.set("type", type);
    if (status) next.set("status", status);
    if (period) next.set("period", period);
    if (areaId) next.set("areaId", areaId);
    const query = next.toString();
    return query ? `/switches?${query}#history` : `/switches#history`;
  }

  return (
    <AppShell user={user}>
      <PageHeader title="Switch Workflows" eyebrow="Camper and staff schedule changes" />

      {toast ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-forest-200 bg-forest-50 p-4 text-sm font-semibold text-forest-900 shadow-soft">
          <span>✓ {toast}</span>
          <a href="#pending-review" className="font-bold text-forest-700 underline">
            View pending queue
          </a>
        </div>
      ) : null}

      {!session ? (
        <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 shadow-soft">
          No active session is selected, so switch requests are not available yet.
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pending switches" value={pendingSwitches.length} tone={pendingSwitches.length ? "warning" : "forest"} detail="Awaiting decision" />
        <StatCard label="Approved" value={approvedSwitches.length} tone="forest" detail="Approved this session" />
        <StatCard label="Denied" value={deniedSwitches.length} tone={deniedSwitches.length ? "warning" : "forest"} detail="Denied this session" />
        <StatCard label="Available offerings" value={offerings.length} detail="Eligible switch destinations" />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <form action={createCamperSwitch}>
            <SectionHeader title="Create camper switch" description="Move a camper from their current registration into another available offering.">
              <Link
                href="/switches/new"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-lake-600 px-3 py-1.5 text-sm font-black text-white shadow-sm transition hover:bg-lake-700"
              >
                Guided switch <ArrowRight className="h-4 w-4" />
              </Link>
              {!canCreateCamperSwitch ? <Badge tone="amber">Needs camper registration and offering</Badge> : null}
            </SectionHeader>
            <div className="grid gap-4">
              <Field label="Current registration">
                <select className={inputClass} name="currentRegistrationId" disabled={!canCreateCamperSwitch}>
                  {registrations.map((registration) => (
                    <option key={registration.id} value={registration.id}>
                      {registration.camper.firstName} {registration.camper.lastName} - {PERIOD_LABEL[registration.period]} - {registration.offering.activity.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Requested offering">
                <select className={inputClass} name="requestedOfferingId" disabled={!canCreateCamperSwitch}>
                  {camperOfferings.map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {PERIOD_LABEL[offering.period]} - {offering.area.name} - {offering.activity.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reason">
                <input className={inputClass} name="reason" disabled={!canCreateCamperSwitch} />
              </Field>
              {canCreateCamperSwitch ? (
                <button className={buttonClass} type="submit">Create switch request</button>
              ) : (
                <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-600">
                  Add at least one active camper registration and active offering before creating camper switches.
                </p>
              )}
            </div>
          </form>
        </Panel>

        <Panel>
          <form action={createStaffSwitch}>
            <SectionHeader title="Create staff switch" description="Move staff from their current assignment into another available offering.">
              <Link
                href="/switches/new-staff"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-lake-600 px-3 py-1.5 text-sm font-black text-white shadow-sm transition hover:bg-lake-700"
              >
                Guided switch <ArrowRight className="h-4 w-4" />
              </Link>
              {!canCreateStaffSwitch ? <Badge tone="amber">Needs staff assignment and offering</Badge> : null}
            </SectionHeader>
            <div className="grid gap-4">
              <Field label="Current assignment">
                <select className={inputClass} name="staffAssignmentId" disabled={!canCreateStaffSwitch}>
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.staff.firstName} {assignment.staff.lastName} - {PERIOD_LABEL[assignment.period]} - {assignment.offering.activity.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Requested offering">
                <select className={inputClass} name="requestedOfferingId" disabled={!canCreateStaffSwitch}>
                  {offerings.map((offering) => (
                    <option key={offering.id} value={offering.id}>
                      {PERIOD_LABEL[offering.period]} - {offering.area.name} - {offering.activity.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reason">
                <input className={inputClass} name="reason" disabled={!canCreateStaffSwitch} />
              </Field>
              {canCreateStaffSwitch ? (
                <button className={buttonClass} type="submit">Create staff request</button>
              ) : (
                <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-600">
                  Add at least one staff assignment and active offering before creating staff switches.
                </p>
              )}
            </div>
          </form>
        </Panel>
      </div>

      {pendingSwitches.length ? (
        <section id="pending-review" className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-forest-900">Pending Review</h2>
              <p className="text-sm text-amber-900">Approve or deny these requests first.</p>
            </div>
            <Badge tone="amber">{pendingSwitches.length} pending</Badge>
          </div>
          <div className="mt-4 grid gap-4">
            {pendingSwitches.map((request) => (
              <PendingSwitchCard
                key={request.id}
                data={toPendingCardData(request)}
                canDecide={canDecide(request)}
                decideAction={decideSwitch}
              />
            ))}
          </div>
        </section>
      ) : null}

      <Panel className="mt-6" id="history">
        <SectionHeader title="Switch history" description="All camper and staff switch requests for the active session.">
          <Badge tone={pendingSwitches.length ? "amber" : "green"}>{pendingSwitches.length} pending</Badge>
        </SectionHeader>

        <div className="mb-4 grid gap-3">
          <FilterRow label="Type">
            <FilterChip label="All" href={historyHref({ type: null })} active={!typeFilter} />
            <FilterChip label="Camper" href={historyHref({ type: "CAMPER" })} active={typeFilter === "CAMPER"} />
            <FilterChip label="Staff" href={historyHref({ type: "STAFF" })} active={typeFilter === "STAFF"} />
          </FilterRow>
          <FilterRow label="Status">
            <FilterChip label="All" href={historyHref({ status: null })} active={!statusFilter} />
            <FilterChip label="Pending" href={historyHref({ status: "PENDING" })} active={statusFilter === "PENDING"} />
            <FilterChip label="Approved" href={historyHref({ status: "APPROVED" })} active={statusFilter === "APPROVED"} />
            <FilterChip label="Denied" href={historyHref({ status: "DENIED" })} active={statusFilter === "DENIED"} />
          </FilterRow>
          <FilterRow label="Period">
            <FilterChip label="All" href={historyHref({ period: null })} active={!periodFilter} />
            {CAMPER_PERIODS.map((value) => (
              <FilterChip key={value} label={PERIOD_LABEL[value]} href={historyHref({ period: value })} active={periodFilter === value} />
            ))}
          </FilterRow>
          {isExec && areaOptions.length ? (
            <FilterRow label="Area">
              <FilterChip label="All" href={historyHref({ areaId: null })} active={!areaFilter} />
              {areaOptions.map((area) => (
                <FilterChip key={area.id} label={area.name} href={historyHref({ areaId: area.id })} active={areaFilter === area.id} />
              ))}
            </FilterRow>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr className="border-b">
                <th className="py-3">Type</th>
                <th>Person</th>
                <th>Current</th>
                <th>Requested</th>
                <th>Status</th>
                <th>Requested by</th>
                <th>Decided by</th>
                <th>Validation</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSwitches.length ? filteredSwitches.map((request) => (
                <tr key={request.id} className="border-b align-top last:border-0">
                  <td className="py-3 font-semibold">{request.type}</td>
                  <td>{request.camper ? `${request.camper.firstName} ${request.camper.lastName}` : request.staff ? `${request.staff.firstName} ${request.staff.lastName}` : "-"}</td>
                  <td>{request.currentOffering ? `${PERIOD_LABEL[request.period]} ${request.currentOffering.activity.name}` : "-"}</td>
                  <td>{request.requestedOffering ? `${request.requestedOffering.area.name} - ${request.requestedOffering.activity.name}` : "-"}</td>
                  <td><Badge tone={request.status === SwitchStatus.PENDING ? "amber" : request.status === SwitchStatus.DENIED ? "red" : "green"}>{request.status}</Badge></td>
                  <td className="text-slate-600">{request.requestedBy ?? "-"}</td>
                  <td className="text-slate-600">{request.decidedBy?.name ?? "-"}</td>
                  <td className="max-w-64 text-slate-500">{request.validationNotes}</td>
                  <td>
                    {request.status === SwitchStatus.PENDING && canDecide(request) ? (
                      <div className="flex gap-2">
                        <form action={decideSwitch}>
                          <input name="id" type="hidden" value={request.id} />
                          <input name="decision" type="hidden" value="approve" />
                          <button className="rounded-md bg-forest-700 px-3 py-2 text-xs font-semibold text-white">Approve</button>
                        </form>
                        <form action={decideSwitch}>
                          <input name="id" type="hidden" value={request.id} />
                          <input name="decision" type="hidden" value="deny" />
                          <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">Deny</button>
                        </form>
                      </div>
                    ) : request.camperId ? (
                      <Link href={`/switches/new?camperId=${request.camperId}`} className="text-xs font-semibold text-lake-700 hover:underline">
                        Re-switch →
                      </Link>
                    ) : null}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="py-6 text-center text-sm font-medium text-slate-500" colSpan={9}>
                    {switches.length ? "No switch requests match these filters." : "No switch requests have been created for this session yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      scroll={false}
      className={`min-h-8 rounded-full px-3 py-1 text-xs font-bold transition ${
        active ? "bg-forest-700 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}
