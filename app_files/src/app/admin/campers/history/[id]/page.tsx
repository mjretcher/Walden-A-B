import Link from "next/link";
import { UserRole } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, PageHeader, Panel, SectionHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";
import { WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";

// Same normalization used by the Q2 cabin sync tool — lowercase, trim,
// collapse whitespace, strip dashes/apostrophes/periods. Kept in sync
// deliberately: two names that "count as the same person" in one place
// should count as the same person everywhere.
function norm(s: string): string {
  return s.toLowerCase().trim().replace(/[\s\-'.]+/g, " ").replace(/\s+/g, " ");
}

export default async function CamperHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const { id } = await params;

  const anchor = await prisma.camper.findUnique({ where: { id }, select: { firstName: true, lastName: true } });

  if (!anchor) {
    return (
      <AppShell user={user}>
        <PageHeader title="Camper not found" eyebrow="Full history" />
        <EmptyState title="No camper with this ID" body="They may have been removed, or the link is out of date." />
      </AppShell>
    );
  }

  const anchorKey = `${norm(anchor.firstName)} ${norm(anchor.lastName)}`;

  // Broad DB-level filter (case-insensitive exact name) narrowed further by
  // full normalization in JS below, so punctuation/spacing variants that this
  // camp's own tools already treat as equivalent are treated the same way here.
  const candidates = await prisma.camper.findMany({
    where: {
      firstName: { equals: anchor.firstName, mode: "insensitive" },
      lastName: { equals: anchor.lastName, mode: "insensitive" }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      gender: true,
      genderIdentity: true,
      age: true,
      campGrade: true,
      unit: true,
      swimLevel: true,
      medicalFlags: true,
      counselorAssistant: true,
      active: true,
      status: true,
      createdAt: true,
      session: { select: { id: true, name: true, cycle: true, year: true } },
      cabin: { select: { name: true } },
      allergies: { select: { notes: true, allergyLabel: { select: { name: true } } } },
      weekEnrollments: { select: { weekBlock: true, cabinName: true } },
      registrations: {
        select: {
          id: true,
          period: true,
          status: true,
          registrationWindow: true,
          registrationRole: true,
          offering: { select: { activity: { select: { name: true } }, area: { select: { name: true } } } }
        }
      }
    }
  });

  const records = candidates.filter((c) => `${norm(c.firstName)} ${norm(c.lastName)}` === anchorKey);
  records.sort((a, b) => {
    const yearDiff = (a.session?.year ?? 0) - (b.session?.year ?? 0);
    if (yearDiff !== 0) return yearDiff;
    return (a.session?.cycle ?? "").localeCompare(b.session?.cycle ?? "");
  });

  const attendanceCounts = records.length > 0
    ? await prisma.attendanceRecord.groupBy({
        by: ["camperId", "mark"],
        where: { camperId: { in: records.map((r) => r.id) } },
        _count: { _all: true }
      })
    : [];
  const attendanceByCamperId = new Map<string, Record<string, number>>();
  for (const row of attendanceCounts) {
    if (!attendanceByCamperId.has(row.camperId)) attendanceByCamperId.set(row.camperId, {});
    attendanceByCamperId.get(row.camperId)![row.mark] = row._count._all;
  }

  const displayName = `${anchor.firstName} ${anchor.lastName}`;

  return (
    <AppShell user={user}>
      <PageHeader
        title={displayName}
        eyebrow="Full history — every session"
        description="Read-only. This links every session-scoped record that shares this name — it never edits or moves anything, so nothing here can affect the active session's data."
      />
      <Link href="/admin/campers" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-lake-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to campers
      </Link>

      {records.length === 0 ? (
        <EmptyState title="No records found" body="Couldn't find any camper record with this name." />
      ) : (
        <div className="space-y-4">
          {records.length === 1 ? (
            <div className="rounded-lg border border-lake-200 bg-lake-50 p-3 text-sm text-lake-900">
              Only one session-scoped record exists for this name — nothing to compare yet.
            </div>
          ) : null}
          {records.map((r) => {
            const counts = attendanceByCamperId.get(r.id) ?? {};
            const totalAttendance = Object.values(counts).reduce((a, b) => a + b, 0);
            return (
              <Panel key={r.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionHeader
                    title={r.session?.name ?? "No session"}
                    detail={`${r.session?.cycle ?? "—"} ${r.session?.year ?? ""} · Cabin ${r.cabin?.name ?? "none"} · ${UNIT_LABEL[r.unit]}`}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {r.counselorAssistant ? <Badge tone="blue">CA</Badge> : null}
                    {!r.active ? <Badge tone="red">Inactive</Badge> : null}
                    <Badge tone="neutral">{r.status.replaceAll("_", " ")}</Badge>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MiniStat label="Grade" value={r.campGrade ?? "—"} />
                  <MiniStat label="Swim level" value={SWIM_LABEL[r.swimLevel]} />
                  <MiniStat label="Gender" value={r.genderIdentity || r.gender} />
                  <MiniStat label="Age" value={r.age != null ? String(r.age) : "—"} />
                </div>

                {r.allergies.length > 0 || r.medicalFlags ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-black">Medical / allergies</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {r.allergies.map((a, i) => <Badge key={i} tone="amber">{a.allergyLabel.name}{a.notes ? ` — ${a.notes}` : ""}</Badge>)}
                    </div>
                    {r.medicalFlags ? <p className="mt-1">{r.medicalFlags}</p> : null}
                  </div>
                ) : null}

                <div className="mt-3">
                  <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Week / bunk enrollment</p>
                  {r.weekEnrollments.length === 0 ? (
                    <p className="text-sm text-slate-500">No week blocks loaded for this session.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {r.weekEnrollments.map((w, i) => (
                        <Badge key={i} tone="blue">{WEEK_BLOCK_LABEL[w.weekBlock]}: {w.cabinName ?? "no bunk"}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">
                    Registrations ({r.registrations.length})
                  </p>
                  {r.registrations.length === 0 ? (
                    <p className="text-sm text-slate-500">No registrations recorded for this session.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600">
                            <th className="p-1.5 text-left">Window</th>
                            <th className="p-1.5 text-left">Period</th>
                            <th className="p-1.5 text-left">Activity</th>
                            <th className="p-1.5 text-left">Area</th>
                            <th className="p-1.5 text-left">Role</th>
                            <th className="p-1.5 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.registrations.map((reg) => (
                            <tr key={reg.id} className="border-b border-slate-100">
                              <td className="p-1.5">{REGISTRATION_WINDOW_LABEL[reg.registrationWindow]}</td>
                              <td className="p-1.5">{PERIOD_LABEL[reg.period]}</td>
                              <td className="p-1.5 font-bold">{reg.offering.activity.name}</td>
                              <td className="p-1.5">{reg.offering.area.name}</td>
                              <td className="p-1.5">{reg.registrationRole.replaceAll("_", " ")}</td>
                              <td className="p-1.5">{reg.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {totalAttendance > 0 ? (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Attendance ({totalAttendance} taken)</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(counts).map(([mark, count]) => (
                        <Badge key={mark} tone={mark === "PRESENT" ? "green" : mark === "ABSENT" ? "red" : "amber"}>
                          {mark.replaceAll("_", " ")}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-forest-900">{value}</p>
    </div>
  );
}
