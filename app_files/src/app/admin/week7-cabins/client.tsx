// @ts-nocheck
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, MoveRight, RotateCcw } from "lucide-react";
import { Panel, buttonClass } from "@/components/ui";
import { backfillWeekCabins, clearStaffWeekOverride, moveCamperForWeek, moveStaffForWeek } from "./actions";

type CabinOption = { id: string; name: string; unit: string };
type PersonRow = { id: string; name: string; isCa?: boolean; position?: string | null };
type CabinRow = {
  id: string;
  name: string;
  unit: string;
  beds: number;
  closing: boolean;
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

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, successNote?: string) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (successNote) setNote(successNote);
      router.refresh();
    });
  }

  function doBackfill() {
    const fd = new FormData();
    fd.set("sessionId", sessionId);
    fd.set("weekBlock", weekBlock);
    run(() => backfillWeekCabins(fd), "Week 7 seeded from current cabins.");
  }

  function moveCamper(camperId: string, cabinId: string) {
    const fd = new FormData();
    fd.set("camperId", camperId);
    fd.set("sessionId", sessionId);
    fd.set("weekBlock", weekBlock);
    fd.set("cabinId", cabinId);
    run(() => moveCamperForWeek(fd));
  }

  function moveStaff(staffId: string, cabinId: string) {
    const fd = new FormData();
    fd.set("staffId", staffId);
    fd.set("sessionId", sessionId);
    fd.set("weekBlock", weekBlock);
    fd.set("cabinId", cabinId);
    run(() => moveStaffForWeek(fd));
  }

  function resetStaff(staffId: string) {
    const fd = new FormData();
    fd.set("staffId", staffId);
    fd.set("sessionId", sessionId);
    fd.set("weekBlock", weekBlock);
    run(() => clearStaffWeekOverride(fd), "Reverted to their session cabin.");
  }

  const openCabins = cabins.filter((c) => !c.closing);
  const closingCabins = cabins.filter((c) => c.closing);

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

      {closingCabins.length ? (
        <Panel>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-black text-forest-900">
              Shutting down for Week 7 ({closingCabins.length})
            </h2>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            These held campers in Weeks 5&ndash;6 and hold none in Week 7. Anyone still listed below needs somewhere
            to go.
          </p>
          <div className="mt-3 space-y-3">
            {closingCabins.map((cabin) => (
              <CabinCard
                key={cabin.id}
                cabin={cabin}
                allCabins={allCabins}
                pending={pending}
                onMoveCamper={moveCamper}
                onMoveStaff={moveStaff}
                onResetStaff={resetStaff}
              />
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {openCabins.map((cabin) => (
          <CabinCard
            key={cabin.id}
            cabin={cabin}
            allCabins={allCabins}
            pending={pending}
            onMoveCamper={moveCamper}
            onMoveStaff={moveStaff}
            onResetStaff={resetStaff}
          />
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

function CabinCard({
  cabin,
  allCabins,
  pending,
  onMoveCamper,
  onMoveStaff,
  onResetStaff
}: {
  cabin: CabinRow;
  allCabins: CabinOption[];
  pending: boolean;
  onMoveCamper: (camperId: string, cabinId: string) => void;
  onMoveStaff: (staffId: string, cabinId: string) => void;
  onResetStaff: (staffId: string) => void;
}) {
  const headcount = cabin.campers.length;
  const overfilled = cabin.beds > 0 && headcount > cabin.beds;

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-soft ${
        cabin.closing ? "border-amber-300 bg-amber-50/40" : "border-slate-200"
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

      {cabin.closing ? (
        <p className="mt-1 text-xs font-black uppercase tracking-wide text-amber-700">Closing for Week 7</p>
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
                    {allCabins.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
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
                    {allCabins.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
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
