import { UserRole } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { SwitchImpactPanel, type SwitchImpactSide } from "@/components/switches/switch-impact-panel";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL } from "@/lib/periods";
import { submitStaffSwitch } from "../../actions";

const offeringInclude = {
  activity: true,
  area: true,
  staffAssignments: { include: { staff: { select: { firstName: true, lastName: true } } } },
  _count: { select: { staffAssignments: true } }
} as const;

function staffNames(assignments: { staff: { firstName: string; lastName: string } }[]): string {
  if (!assignments.length) return "No staff assigned";
  return assignments.map((assignment) => `${assignment.staff.firstName} ${assignment.staff.lastName}`).join(", ");
}

function leaveNote(employmentEnd: Date | null): string | null {
  if (!employmentEnd) return null;
  return `Leaves ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(employmentEnd)}`;
}

export default async function StaffConfirmPage({
  searchParams
}: {
  searchParams?: Promise<{ assignmentId?: string; offeringId?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const assignment = params.assignmentId
    ? await prisma.staffAssignment.findUnique({
        where: { id: params.assignmentId },
        include: { staff: { include: { primaryArea: { select: { name: true } } } }, offering: { include: offeringInclude } }
      })
    : null;
  const requestedOffering = params.offeringId
    ? await prisma.activityOffering.findFirst({ where: { id: params.offeringId, active: true }, include: offeringInclude })
    : null;

  if (!assignment || !requestedOffering) {
    return (
      <AppShell user={user}>
        <PageHeader title="Review & confirm" eyebrow="Step 3 of 3" />
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 shadow-soft">
          This switch can no longer be confirmed — the assignment or destination offering is unavailable.{" "}
          <Link className="font-bold underline" href="/switches/new-staff">
            Start over
          </Link>
          .
        </div>
      </AppShell>
    );
  }

  const { staff } = assignment;
  const currentCount = assignment.offering._count.staffAssignments;
  const requestedCount = requestedOffering._count.staffAssignments;
  const isCurrent = requestedOffering.id === assignment.offeringId;

  const leaving: SwitchImpactSide = {
    kind: "leaving",
    areaName: assignment.offering.area.name,
    activityName: assignment.offering.activity.name,
    periodLabel: `Period ${PERIOD_LABEL[assignment.period]}`,
    metricLabel: "Staffed",
    before: currentCount,
    after: currentCount - 1,
    capacityNote: `target ${assignment.offering.staffTarget}`,
    countTone: currentCount - 1 < assignment.offering.staffTarget ? "warn" : "ok",
    staff: staffNames(assignment.offering.staffAssignments),
    staffWarn: assignment.offering.staffAssignments.length === 0
  };
  const joining: SwitchImpactSide = {
    kind: "joining",
    areaName: requestedOffering.area.name,
    activityName: requestedOffering.activity.name,
    periodLabel: `Period ${PERIOD_LABEL[requestedOffering.period]}`,
    metricLabel: "Staffed",
    before: requestedCount,
    after: requestedCount + 1,
    capacityNote: `target ${requestedOffering.staffTarget}`,
    countTone: requestedCount + 1 > requestedOffering.staffTarget ? "warn" : "ok",
    staff: staffNames(requestedOffering.staffAssignments),
    staffWarn: requestedOffering.staffAssignments.length === 0
  };

  const staffStrip = [staff.primaryArea?.name, leaveNote(staff.employmentEnd)].filter(Boolean);
  const crossArea = requestedOffering.areaId !== user.areaId;
  const isExec = user.role === UserRole.EXECUTIVE_ADMIN;

  return (
    <AppShell user={user}>
      <PageHeader title="Review & confirm" eyebrow="Step 3 of 3 · Confirm the switch" />

      <div className="grid gap-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft">
          <span className="font-black uppercase tracking-wide text-forest-900">
            {staff.firstName} {staff.lastName}
          </span>
          {staffStrip.length ? <span className="text-slate-600">{"  ·  " + staffStrip.join("  ·  ")}</span> : null}
        </div>

        <SwitchImpactPanel leaving={leaving} joining={joining} />

        {isCurrent ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            This is already {staff.firstName}&rsquo;s current assignment for this period.
          </div>
        ) : null}

        {crossArea && !isCurrent ? (
          <div className="rounded-xl border border-lake-200 bg-lake-50 px-4 py-3 text-sm text-lake-900">
            <p className="font-bold">↗ Cross-area switch</p>
            <p className="mt-0.5">
              This request goes to the {requestedOffering.area.name} area head for approval. You&rsquo;ll see its status in
              &ldquo;My outbound requests.&rdquo;
            </p>
          </div>
        ) : null}

        <form action={submitStaffSwitch} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <input type="hidden" name="assignmentId" value={assignment.id} />
          <input type="hidden" name="offeringId" value={requestedOffering.id} />

          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            <span>Reason (optional)</span>
            <textarea
              name="reason"
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-lake-500 focus:ring-2 focus:ring-lake-100"
              placeholder="Why is this switch being requested? (optional — visible in history and to the approver)."
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <Link
              href={`/switches/new-staff/destination?assignmentId=${assignment.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>

            <div className="flex flex-1 flex-wrap justify-end gap-2">
              <button
                type="submit"
                name="decision"
                value="submit"
                disabled={isCurrent}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-lake-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-lake-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Submit for review <ArrowRight className="h-4 w-4" />
              </button>
              {isExec ? (
                <button
                  type="submit"
                  name="decision"
                  value="approve"
                  disabled={isCurrent}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-forest-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Approve immediately <Check className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
