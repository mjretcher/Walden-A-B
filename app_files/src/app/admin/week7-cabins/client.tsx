// @ts-nocheck
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Lock, LockOpen, MoveRight, RotateCcw } from "lucide-react";
import { Panel, buttonClass } from "@/components/ui";
import {
  backfillWeekCabins,
  clearStaffWeekOverride,
  closeCabinForWeek,
  moveCamperForWeek,
  moveStaffForWeek,
  reopenCabinForWeek
} from "./actions";

type CabinOption = { id: string; name: string; unit: string; closed: boolean };
type PersonRow = { id: string; name: string; isCa?: boolean; position?: string | null };
type CabinRow = {
  id: string;
  name: string;
  unit: string;
  beds: number;
  closedManually: boolean;
  emptied: boolean;
  campers: PersonRow[];
  staff: PersonRow[];
};

const UNIT_LABEL: Record<string, string> = {
  UNIT1: "Unit 1",
  UNIT2: "Unit 2",
  UNIT3: "Unit 3",
  UNIT4: "Unit 4"
};

export function Week7CabinsClient({
  sessionId,
  weekBlock,
  unstamped,
  cabins,
  allCabins
}: {
  sessionId: string;
  weekBlock: string;
  unstamped: number;
  cabins: CabinRow[];
  allCabins: CabinOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function run(fn: () => Promise<any>, successNote?: (result: any) => string | null) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (successNote) setNote(successNote(result));
      router.refresh();
    });
  }

  function base() {
    const fd = new FormData();
    fd.set("sessionId", sessionId);
    fd.set("weekBlock", weekBlock);
    return fd;
  }

  function doBackfill() {
    run(() => backfillWeekCabins(base()), () => "Week 7 seeded from current cabins.");
  }

  function moveCamper(camperId: string, cabinId: string) {
    const fd = base();
    fd.set("camperId", camperId);
    fd.set("cabinId", cabinId);
    run(() => moveCamperForWeek(fd));
  }

  function moveStaff(staffId: string, cabinId: string) {
    const fd = base();
    fd.set("staffId", staffId);
    fd.set("cabinId", cabinId);
    run(() => moveStaffForWeek(fd));
  }

  function resetStaff(staffId: string) {
    const fd = base();
    fd.set("staffId", staffId);
    run(() => clearStaffWeekOverride(fd), () => "Reverted to their session cabin.");
  }

  function closeCabin(cabinId: string, cabinName: string) {
    const fd = base();
    fd.set("cabinId", cabinId);
    run(
      () => closeCabinForWeek(fd),
      (result) =>
        result.stranded > 0
          ? `${cabinName} closed — ${result.stranded} camper${result.stranded !== 1 ? "s are" : " is"} still assigned to it and need somewhere to go.`
          : `${cabinName} closed for Week 7.`
    );
  }

  function reopenCabin(cabinId: string, cabinName: string) {
    const fd = base();
    fd.set("cabinId", cabinId);
    run(() => reopenCabinForWeek(fd), () => `${cabinName} reopened.`);
  }

  const shut = cabins.filter((c) => c.closedManually || c.emptied);
  const open = cabins.filter((c) => !c.closedManually && !c.emptied);

  const cardProps = {
    allCabins,
    pending,
    onMoveCamper: moveCamper,
    onMoveStaff: moveStaff,
    onResetStaff: resetStaff,
    onCloseCabin: closeCabin,
    onReopenCabin: reopenCabin
  };

  return (
    <div className="space-y-5">
      {unstamped > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm font-black text-amber-900">Seed Week 7 before making changes</p>
          <p className="mt-1 text-sm font-semibold text-amber-800">
            {unstamped} Week 7 enrollment{unstamped !== 1 ? "s" : ""} {unstamped !== 1 ? "have" : "has"} no cabin
            stamped yet. Seeding copies each camper&rsquo;s current cabin onto their Week 7 row, so the final week
            starts as an exact match and every move after that is a deliberate change. It never overwrites a move
            you&rsquo;ve already made.
          </p>
          <button type="button" onClick={doBackfill} disabled={pending} className={`${buttonClass} mt-3`}>
            {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
            Seed Week 7 from current cabins
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
          {error}
        </div>
      ) : null}
      {note ? (
        <div className="rounded-lg border border-forest-200 bg-forest-50 px-4 py-3 text-sm font-bold text-forest-900">
          {note}
        </div>
      ) : null}

      {shut.length ? (
        <Panel>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-black text-forest-900">Not operating in Week 7 ({shut.length})</h2>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Either closed by hand, or emptied out when the two-week campers left. Anyone still listed inside one of
            these needs somewhere to go.
          </p>
          <div className="mt-3 space-y-3">
            {shut.map((cabin) => (
              <CabinCard key={cabin.id} cabin={cabin} {...cardProps} />
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {open.map((cabin) => (
          <CabinCard key={cabin.id} cabin={cabin} {...cardProps} />
        ))}
      </div>

      {!cabins.length ? (
        <Panel>
          <p className="text-sm font-semibold text-slate-500">No cabins on this side.</p>
        </Panel>
      ) : null}
    </div>
  );
}

/**
 * Destination list for a move. Closed cabins are dropped, EXCEPT the one
 * the person is sitting in right now -- a select whose value isn't among
 * its options renders blank, which would make a stranded camper look
 * unassigned rather than stuck somewhere closed.
 */
function destinationOptions(allCabins: CabinOption[], currentCabinId: string) {
  return allCabins.filter((c) => !c.closed || c.id === currentCabinId);
}

function CabinCard({
  cabin,
  allCabins,
  pending,
  onMoveCamper,
  onMoveStaff,
  onResetStaff,
  onCloseCabin,
  onReopenCabin
}: {
  cabin: CabinRow;
  allCabins: CabinOption[];
  pending: boolean;
  onMoveCamper: (camperId: string, cabinId: string) => void;
  onMoveStaff: (staffId: string, cabinId: string) => void;
  onResetStaff: (staffId: string) => void;
  onCloseCabin: (cabinId: string, cabinName: string) => void;
  onReopenCabin: (cabinId: string, cabinName: string) => void;
}) {
  const headcount = cabin.campers.length;
  const overfilled = cabin.beds > 0 && headcount > cabin.beds;
  const stranded = cabin.closedManually && (headcount > 0 || cabin.staff.length > 0);
  const options = destinationOptions(allCabins, cabin.id);

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-soft ${
        stranded
          ? "border-rose-300 bg-rose-50/40"
          : cabin.closedManually || cabin.emptied
            ? "border-amber-300 bg-amber-50/40"
            : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-black text-forest-900">{cabin.name}</h3>
        <span className="text-xs font-bold text-slate-500">{UNIT_LABEL[cabin.unit] ?? cabin.unit}</span>
        <span className={`ml-auto text-xs font-black ${overfilled ? "text-rose-600" : "text-slate-500"}`}>
          {headcount}
          {cabin.beds > 0 ? ` / ${cabin.beds}` : ""} {overfilled ? "⚠" : ""}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        {cabin.closedManually ? (
          <span className="rounded bg-amber-200 px-1.5 text-[10px] font-black uppercase tracking-wide text-amber-900">
            Closed
          </span>
        ) : null}
        {cabin.emptied && !cabin.closedManually ? (
          <span className="text-[11px] font-black uppercase tracking-wide text-amber-700">Emptied for Week 7</span>
        ) : null}

        {cabin.closedManually ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onReopenCabin(cabin.id, cabin.name)}
            className="ml-auto inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-600 hover:bg-slate-50"
          >
            <LockOpen className="h-3 w-3" /> Reopen
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => onCloseCabin(cabin.id, cabin.name)}
            className="ml-auto inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-600 hover:bg-slate-50"
          >
            <Lock className="h-3 w-3" /> Close for Week 7
          </button>
        )}
      </div>

      {stranded ? (
        <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-800">
          Closed, but {headcount ? `${headcount} camper${headcount !== 1 ? "s" : ""}` : ""}
          {headcount && cabin.staff.length ? " and " : ""}
          {cabin.staff.length ? `${cabin.staff.length} staff` : ""} still assigned here.
        </p>
      ) : null}

      <div className="mt-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Staff</p>
        {cabin.staff.length ? (
          <ul className="mt-1 space-y-1">
            {cabin.staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold text-slate-700">{s.name}</span>
                {s.position ? <span className="text-xs font-semibold text-slate-400">{s.position}</span> : null}
                <span className="ml-auto flex items-center gap-1">
                  <MoveRight className="h-3 w-3 text-slate-300" />
                  <select
                    disabled={pending}
                    value={cabin.id}
                    onChange={(e) => onMoveStaff(s.id, e.target.value)}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-bold text-slate-600"
                  >
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.closed ? " (closed)" : ""}
                      </option>
                    ))}
                    <option value="">— out of cabin —</option>
                  </select>
                  <button
                    type="button"
                    title="Revert to session cabin"
                    disabled={pending}
                    onClick={() => onResetStaff(s.id)}
                    className="rounded border border-slate-200 p-1 text-slate-400 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs font-semibold text-slate-400">None</p>
        )}
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
          Campers ({cabin.campers.length})
        </p>
        {cabin.campers.length ? (
          <ul className="mt-1 space-y-1">
            {cabin.campers.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-700">{c.name}</span>
                {c.isCa ? (
                  <span className="rounded bg-forest-100 px-1 text-[10px] font-black text-forest-800">CA</span>
                ) : null}
                <span className="ml-auto flex items-center gap-1">
                  <MoveRight className="h-3 w-3 text-slate-300" />
                  <select
                    disabled={pending}
                    value={cabin.id}
                    onChange={(e) => onMoveCamper(c.id, e.target.value)}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-bold text-slate-600"
                  >
                    {options.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                        {opt.closed ? " (closed)" : ""}
                      </option>
                    ))}
                  </select>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs font-semibold text-slate-400">Empty in Week 7</p>
        )}
      </div>
    </div>
  );
}
