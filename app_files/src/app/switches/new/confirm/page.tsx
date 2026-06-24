import { RegistrationRole, RegistrationStatus, UserRole } from "@prisma/client";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { SwitchImpactPanel, type SwitchImpactSide } from "@/components/switches/switch-impact-panel";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { departureNote } from "@/lib/week-enrollment";
import { computeOfferingVerdict } from "@/lib/switch-eligibility";
import { submitCamperSwitch } from "../../actions";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];

const offeringInclude = {
  activity: true,
  area: true,
  staffAssignments: { include: { staff: { select: { firstName: true, lastName: true } } } },
  _count: { select: { registrations: { where: { registrationRole: RegistrationRole.CAMPER, status: { in: activeRegistration } } } } }
} as const;

function staffNames(assignments: { staff: { firstName: string; lastName: string } }[]): string {
  if (!assignments.length) return "No staff assigned";
  return assignments.map((assignment) => `${assignment.staff.firstName} ${assignment.staff.lastName}`).join(", ");
}

export default async function ConfirmStepPage({
  searchParams
}: {
  searchParams?: Promise<{ registrationId?: string; offeringId?: string }>;
}) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN, UserRole.AREA_HEAD]);
  const params = searchParams ? await searchParams : {};

  const registration = params.registrationId
    ? await prisma.registration.findFirst({
        where: { id: params.registrationId, status: { in: activeRegistration } },
        include: { camper: { include: { cabin: true, weekEnrollments: true } }, offering: { include: offeringInclude } }
      })
    : null;
  const requestedOffering = params.offeringId
    ? await prisma.activityOffering.findFirst({
        where: { id: params.offeringId, active: true, visibleForCamperRegistration: true },
        include: offeringInclude
      })
    : null;

  if (!registration || !requestedOffering) {
    return (
      <AppShell user={user}>
        <PageHeader title="Review & confirm" eyebrow="Step 3 of 3" />
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900 shadow-soft">
          This switch can no longer be confirmed — the registration or destination offering is unavailable.{" "}
          <Link className="font-bold underline" href="/switches/new">
            Start over
          </Link>
          .
        </div>
      </AppShell>
    );
  }

  const { camper } = registration;
  const currentCount = registration.offering._count.registrations;
  const requestedCount = requestedOffering._count.registrations;
  const isCurrent = requestedOffering.id === registration.offeringId;

  const verdict = computeOfferingVerdict({
    camperFirstName: camper.firstName,
    camperUnit: camper.unit,
    camperSwimLevel: camper.swimLevel,
    counselorAssistant: camper.counselorAssistant,
    offering: requestedOffering,
    enrollmentCount: requestedCount,
    isCurrent,
    role: user.role
  });

  const joinTone: SwitchImpactSide["countTone"] =
    requestedOffering.rosterLimit != null
      ? requestedCount + 1 > requestedOffering.rosterLimit
        ? "over"
        : requestedCount + 1 === requestedOffering.rosterLimit
          ? "warn"
          : "ok"
      : "ok";

  const leaving: SwitchImpactSide = {
    kind: "leaving",
    areaName: registration.offering.area.name,
    activityName: registration.offering.activity.name,
    periodLabel: `Period ${PERIOD_LABEL[registration.period]}`,
    metricLabel: "Enrollment",
    before: currentCount,
    after: currentCount - 1,
    capacityNote: registration.offering.rosterLimit ? `of ${registration.offering.rosterLimit} max` : null,
    countTone: "ok",
    staff: staffNames(registration.offering.staffAssignments),
    staffWarn: registration.offering.staffAssignments.length === 0
  };
  const joining: SwitchImpactSide = {
    kind: "joining",
    areaName: requestedOffering.area.name,
    activityName: requestedOffering.activity.name,
    periodLabel: `Period ${PERIOD_LABEL[requestedOffering.period]}`,
    metricLabel: "Enrollment",
    before: requestedCount,
    after: requestedCount + 1,
    capacityNote: requestedOffering.rosterLimit ? `of ${requestedOffering.rosterLimit} max` : null,
    countTone: joinTone,
    staff: staffNames(requestedOffering.staffAssignments),
    staffWarn: requestedOffering.staffAssignments.length === 0
  };

  const camperStrip = [
    camper.cabin?.name,
    UNIT_LABEL[camper.unit],
    SWIM_LABEL[camper.swimLevel],
    departureNote(camper.weekEnrollments)
  ].filter(Boolean);

  const crossArea = requestedOffering.areaId !== user.areaId;
  const isHardBlock = verdict.tone === "block";
  const isWarning = verdict.tone === "warn";
  // Area heads cannot submit through a hard eligibility block; exec admins can.
  const submitDisabled = isCurrent || !verdict.selectable;
  const isExec = user.role === UserRole.EXECUTIVE_ADMIN;

  return (
    <AppShell user={user}>
      <PageHeader title="Review & confirm" eyebrow="Step 3 of 3 · Confirm the switch" />

      <div className="grid gap-4">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft">
          <span className="font-black uppercase tracking-wide text-forest-900">
            {camper.firstName} {camper.lastName}
          </span>
          {camperStrip.length ? <span className="text-slate-600">{"  ·  " + camperStrip.join("  ·  ")}</span> : null}
        </div>

        <SwitchImpactPanel leaving={leaving} joining={joining} />

        {isCurrent ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            This is already {camper.firstName}&rsquo;s current offering for this period.
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

        {isHardBlock && !isCurrent ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            🔴 {verdict.label}
            {!isExec ? <span className="ml-1 font-normal">— submit is disabled. Contact an exec admin to override.</span> : null}
          </div>
        ) : isWarning && !isCurrent ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            ⚠ {verdict.label}. This is non-blocking — the approval will be noted.
          </div>
        ) : null}

        <form action={submitCamperSwitch} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <input type="hidden" name="registrationId" value={registration.id} />
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
              href={`/switches/new/destination?registrationId=${registration.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>

            <div className="flex flex-1 flex-wrap justify-end gap-2">
              <button
                type="submit"
                name="decision"
                value="submit"
                disabled={submitDisabled}
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
