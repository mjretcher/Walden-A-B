"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Printer, Search, Wand2, X } from "lucide-react";
import { buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { saveMessHallArrangement } from "./actions";

type Person = {
  id: string; first: string; last: string;
  cabin: string; cabinId: string; unit: string; gender: string;
  type: "staff" | "camper" | "ca"; tag: string;
};
type CabinMeta = { cabinId: string; cabin: string; unit: string; gender: string };
type Table = { id: string; name: string; cap: number };
type Saved = { tables: Table[]; assign: Record<string, string>; defCap?: number } | null;

const unitLabel = (u: string) => (u ? u.replace("UNIT", "Unit ") : "");
const dotColor = (g: string) => (g === "FEMALE" ? "#b8437a" : g === "MALE" ? "#2f6db0" : "#8a8a8a");
const typeRank = (t: Person["type"]) => (t === "staff" ? 0 : t === "ca" ? 2 : 1);
function cmpPeople(a: Person, b: Person) {
  if (typeRank(a.type) !== typeRank(b.type)) return typeRank(a.type) - typeRank(b.type);
  return (a.last + a.first).localeCompare(b.last + b.first);
}

export function MessHallBoard({
  sessionId, sessionLabel, generatedAt, people, cabins, initial
}: {
  sessionId: string;
  sessionLabel: string;
  generatedAt: string;
  people: Person[];
  cabins: CabinMeta[];
  initial: Saved;
}) {
  const cabinOrder = useMemo(() => cabins.map((c) => c.cabinId), [cabins]);
  const cabinMeta = useMemo(() => Object.fromEntries(cabins.map((c) => [c.cabinId, c])), [cabins]);

  const [defCap, setDefCap] = useState<number>(initial?.defCap ?? 20);
  const [tables, setTables] = useState<Table[]>(() => initial?.tables ?? []);
  const [assign, setAssign] = useState<Record<string, string>>(() => initial?.assign ?? {});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [dropTid, setDropTid] = useState<string | null>(null);
  const [addN, setAddN] = useState(1);

  const tidRef = useRef(tables.length + 1);
  const dragRef = useRef<{ type: "person" | "cabin"; id: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [savedAt, setSavedAt] = useState<string>("");
  const firstRun = useRef(true);

  // Seed a sensible number of empty tables the first time (no saved layout).
  useEffect(() => {
    if (!initial?.tables || initial.tables.length === 0) {
      const target = Math.max(8, Math.ceil(people.length / (defCap || 20)));
      const t: Table[] = [];
      for (let i = 0; i < target; i++) t.push({ id: "t" + tidRef.current++, name: "T" + (i + 1), cap: defCap || 20 });
      setTables(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save to the shared arrangement.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const h = setTimeout(() => {
      startSave(async () => {
        try { await saveMessHallArrangement(sessionId, JSON.stringify({ tables, assign, defCap })); setSavedAt(new Date().toLocaleTimeString()); }
        catch { /* surfaced via lack of timestamp */ }
      });
    }, 500);
    return () => clearTimeout(h);
  }, [tables, assign, defCap, sessionId]);

  const seatedCount = (tid: string) => people.reduce((n, p) => (assign[p.id] === tid ? n + 1 : n), 0);
  const totalSeated = Object.keys(assign).length;

  const unplaced = useMemo(() => {
    const m: Record<string, Person[]> = {};
    for (const p of people) if (!assign[p.id]) (m[p.cabinId] ||= []).push(p);
    for (const k of Object.keys(m)) m[k].sort(cmpPeople);
    return m;
  }, [people, assign]);

  const occupants = (tid: string) => {
    const m: Record<string, Person[]> = {};
    for (const p of people) if (assign[p.id] === tid) (m[p.cabinId] ||= []).push(p);
    for (const k of Object.keys(m)) m[k].sort(cmpPeople);
    return m;
  };

  // ---- mutations ----
  const assignPerson = (id: string, tid: string) => setAssign((a) => ({ ...a, [id]: tid }));
  const assignCabin = (cid: string, tid: string) =>
    setAssign((a) => { const next = { ...a }; for (const p of people) if (p.cabinId === cid && !next[p.id]) next[p.id] = tid; return next; });
  const unassignPerson = (id: string) => setAssign((a) => { const next = { ...a }; delete next[id]; return next; });
  const unassignCabin = (cid: string) =>
    setAssign((a) => { const next = { ...a }; for (const p of people) if (p.cabinId === cid) delete next[p.id]; return next; });

  const addTable = () => setTables((t) => [...t, { id: "t" + tidRef.current++, name: "T" + (t.length + 1), cap: defCap }]);
  const addTables = (n: number) => setTables((t) => { const out = [...t]; for (let i = 0; i < n; i++) out.push({ id: "t" + tidRef.current++, name: "T" + (out.length + 1), cap: defCap }); return out; });
  const removeTable = (tid: string) => {
    setAssign((a) => { const next = { ...a }; for (const k of Object.keys(next)) if (next[k] === tid) delete next[k]; return next; });
    setTables((t) => t.filter((x) => x.id !== tid));
  };
  const renameTable = (tid: string, name: string) => setTables((t) => t.map((x) => (x.id === tid ? { ...x, name } : x)));
  const setCap = (tid: string, cap: number) => setTables((t) => t.map((x) => (x.id === tid ? { ...x, cap: Math.max(1, cap || 1) } : x)));

  const autofill = () => {
    setAssign((a) => {
      const next = { ...a };
      const seat: Record<string, number> = {};
      for (const t of tables) seat[t.id] = people.reduce((n, p) => (next[p.id] === t.id ? n + 1 : n), 0);
      const extra: Table[] = [];
      const nextTid = { v: tidRef.current };
      for (const cid of cabinOrder) {
        for (const p of people) {
          if (p.cabinId !== cid || next[p.id]) continue;
          let target = [...tables, ...extra].find((t) => (seat[t.id] ?? 0) < t.cap);
          if (!target) { target = { id: "t" + nextTid.v++, name: "T" + (tables.length + extra.length + 1), cap: defCap }; extra.push(target); seat[target.id] = 0; }
          next[p.id] = target.id; seat[target.id] = (seat[target.id] ?? 0) + 1;
        }
      }
      if (extra.length) { tidRef.current = nextTid.v; setTables((t) => [...t, ...extra]); }
      return next;
    });
  };

  const reset = () => { if (confirm("Clear all tables and seating for this session?")) { setAssign({}); const target = Math.max(8, Math.ceil(people.length / (defCap || 20))); const t: Table[] = []; for (let i = 0; i < target; i++) t.push({ id: "t" + tidRef.current++, name: "T" + (i + 1), cap: defCap || 20 }); setTables(t); } };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ session: sessionLabel, tables, assign }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mess-hall-seating.json"; a.click(); URL.revokeObjectURL(a.href);
  };

  // ---- drag & drop ----
  const onDropTable = (tid: string) => { const d = dragRef.current; if (!d) return; if (d.type === "person") assignPerson(d.id, tid); else assignCabin(d.id, tid); dragRef.current = null; setDropTid(null); };
  const onDropPool = () => { const d = dragRef.current; if (!d) return; if (d.type === "person") unassignPerson(d.id); else unassignCabin(d.id); dragRef.current = null; setDropTid(null); };

  const q = query.trim().toLowerCase();
  const matches = (p: Person) => !q || (p.first + " " + p.last).toLowerCase().includes(q);
  const cabinMatches = (cid: string) => !q || cabinMeta[cid]?.cabin.toLowerCase().includes(q) || (unplaced[cid] || []).some(matches);

  return (
    <div>
      <style>{`
        @media print {
          .mh-noprint { display: none !important; }
          .mh-grid { display: block !important; }
          .mh-tables { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 8px !important; }
          .mh-table { break-inside: avoid; border: 1px solid #333 !important; }
          .mh-rm { display: none !important; }
        }
      `}</style>

      {/* toolbar */}
      <div className="mh-noprint mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-soft">
        <div className="text-sm text-slate-500">
          <span className="font-black text-forest-900">{sessionLabel}</span>
          <span className="ml-2">{people.length} people · {totalSeated} seated · {people.length - totalSeated} to place · {tables.length} tables</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-500">Seats/table
            <input type="number" min={1} value={defCap} onChange={(e) => setDefCap(Math.max(1, parseInt(e.target.value) || 20))} className={`${inputClass} w-16`} />
          </label>
          <button className={secondaryButtonClass} onClick={addTable}><Plus className="mr-1 inline h-4 w-4" />Table</button>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            <input type="number" min={1} value={addN} onChange={(e) => setAddN(Math.max(1, parseInt(e.target.value) || 1))} className={`${inputClass} w-14`} />
            <button className={secondaryButtonClass} onClick={() => addTables(addN)}>Add</button>
          </label>
          <button className={secondaryButtonClass} onClick={autofill}><Wand2 className="mr-1 inline h-4 w-4" />Auto-seat</button>
          <button className={secondaryButtonClass} onClick={() => window.print()}><Printer className="mr-1 inline h-4 w-4" />Print</button>
          <button className={secondaryButtonClass} onClick={exportJson}>Export</button>
          <button className={secondaryButtonClass} onClick={reset}>Reset</button>
          <span className="min-w-[70px] text-xs text-slate-400">
            {saving ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Saving…</> : savedAt ? `Saved ${savedAt}` : ""}
          </span>
        </div>
      </div>

      <div className="mh-grid grid gap-4" style={{ gridTemplateColumns: "300px 1fr" }}>
        {/* pool */}
        <aside className="mh-noprint self-start rounded-xl border border-slate-200 bg-white shadow-soft" style={{ position: "sticky", top: "1rem", maxHeight: "calc(100vh - 130px)", overflow: "auto" }}
          onDragOver={(e) => { e.preventDefault(); }} onDrop={onDropPool}>
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <span className="text-sm font-bold text-forest-900">Unseated</span>
            <span className="relative text-xs text-slate-400">
              <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find…" className={`${inputClass} h-7 w-32 pl-7 text-xs`} />
            </span>
          </div>
          <div className="p-2">
            {cabinOrder.filter((cid) => (unplaced[cid] || []).length && cabinMatches(cid)).map((cid) => {
              const list = unplaced[cid] || [];
              const meta = cabinMeta[cid];
              const isOpen = !!open[cid] || !!q;
              return (
                <div key={cid} className="mb-2 overflow-hidden rounded-lg border border-slate-200">
                  <div draggable onDragStart={() => (dragRef.current = { type: "cabin", id: cid })}
                    className="flex cursor-grab items-center gap-2 bg-slate-50 px-2 py-1.5 active:cursor-grabbing">
                    <span className="h-2 w-2 flex-none rounded-full" style={{ background: dotColor(meta.gender) }} />
                    <span className="font-bold">{meta.cabin}</span>
                    <span className="text-[11px] text-slate-400">{unitLabel(meta.unit)}</span>
                    <span className="ml-auto text-[11px] font-bold text-forest-900">{list.length}</span>
                    <button className="text-[11px] text-slate-400" onClick={() => setOpen((o) => ({ ...o, [cid]: !o[cid] }))}>{isOpen ? "hide" : "show"}</button>
                  </div>
                  {isOpen && (
                    <div className="p-1">
                      {list.map((p) => (
                        <div key={p.id} draggable onDragStart={() => (dragRef.current = { type: "person", id: p.id })}
                          className={`flex cursor-grab items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] hover:bg-slate-50 active:cursor-grabbing ${matches(p) && q ? "bg-amber-100" : ""}`}>
                          <span className={p.type === "staff" ? "font-semibold" : p.type === "ca" ? "italic" : ""}>{p.first} {p.last}</span>
                          {p.tag && <span className="rounded bg-forest-700 px-1 text-[10px] font-bold text-white">{p.tag.replace(/[()]/g, "")}</span>}
                          {p.type === "ca" && <span className="rounded border border-slate-200 px-1 text-[9px] text-slate-400">CA</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {people.length - totalSeated === 0 && <div className="p-4 text-sm text-slate-400">Everyone is seated 🎉</div>}
          </div>
        </aside>

        {/* tables */}
        <section className="mh-tables grid content-start gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {tables.map((t) => {
            const groups = occupants(t.id);
            const seated = Object.values(groups).reduce((n, a) => n + a.length, 0);
            const over = seated > t.cap, full = seated === t.cap && seated > 0;
            const cids = Object.keys(groups).sort((a, b) => cabinOrder.indexOf(a) - cabinOrder.indexOf(b));
            return (
              <div key={t.id}
                className={`mh-table flex min-h-[90px] flex-col rounded-xl border bg-white ${dropTid === t.id ? "border-forest-600 ring-2 ring-forest-200" : "border-slate-200"}`}
                onDragOver={(e) => { e.preventDefault(); setDropTid(t.id); }} onDragLeave={() => setDropTid((d) => (d === t.id ? null : d))} onDrop={() => onDropTable(t.id)}>
                <div className="flex items-center gap-2 border-b border-slate-200 px-2.5 py-2">
                  <input value={t.name} onChange={(e) => renameTable(t.id, e.target.value)} className="w-24 rounded px-1 py-0.5 text-sm font-bold focus:outline focus:outline-1 focus:outline-slate-200" />
                  <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                    <span className={`font-extrabold ${over ? "text-red-600" : full ? "text-forest-700" : ""}`}>{seated}</span>/
                    <input type="number" min={1} value={t.cap} onChange={(e) => setCap(t.id, parseInt(e.target.value))} className="mh-rm w-11 rounded border border-slate-200 px-1 py-0.5 text-center text-xs" /> seats
                  </span>
                  <button className="mh-rm text-slate-300 hover:text-red-500" title="Remove table" onClick={() => removeTable(t.id)}><X className="h-4 w-4" /></button>
                </div>
                <div className="flex-1 px-2 py-1.5">
                  {!cids.length && <div className="px-1 py-1.5 text-xs text-slate-300">Drag a cabin or camper here</div>}
                  {cids.map((cid) => {
                    const meta = cabinMeta[cid];
                    return (
                      <div key={cid} className="mb-1.5">
                        <div className="flex items-center gap-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                          <span className="h-2 w-2 rounded-full" style={{ background: dotColor(meta.gender) }} />
                          {meta.cabin}<span className="text-slate-300">· {groups[cid].length}</span>
                        </div>
                        {groups[cid].map((p) => (
                          <div key={p.id} draggable onDragStart={() => (dragRef.current = { type: "person", id: p.id })}
                            className="group flex cursor-grab items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12.5px] hover:bg-slate-50 active:cursor-grabbing">
                            <span className={p.type === "staff" ? "font-semibold" : p.type === "ca" ? "italic" : ""}>{p.first} {p.last}</span>
                            {p.tag && <span className="rounded bg-forest-700 px-1 text-[9px] font-bold text-white">{p.tag.replace(/[()]/g, "")}</span>}
                            <button className="mh-rm ml-auto text-slate-200 hover:text-red-500 group-hover:text-slate-400" onClick={() => unassignPerson(p.id)}><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
