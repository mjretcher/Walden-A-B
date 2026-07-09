"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge, Panel, SectionHeader, buttonClass, dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import {
  assignStaffHousing,
  createHousingLocation,
  createHousingRoom,
  deleteHousingLocation,
  deleteHousingRoom,
  migrateLegacyHousingLabels,
  renameHousingLocation,
  renameHousingRoom
} from "./actions";

type RoomData = { id: string; name: string; bedCount: number | null; staff: { id: string; name: string }[] };
type LocationData = { id: string; name: string; rooms: RoomData[]; directStaff: { id: string; name: string }[] };
type UnassignedStaff = { id: string; name: string; housingLabel: string | null };

type StaffAssignment = { id: string; name: string; target: string; warning: string | null };

function buildInitialAssignments(locations: LocationData[], unassigned: UnassignedStaff[]) {
  const map = new Map<string, StaffAssignment>();
  for (const loc of locations) {
    for (const s of loc.directStaff) map.set(s.id, { id: s.id, name: s.name, target: `location:${loc.id}`, warning: null });
    for (const room of loc.rooms) {
      for (const s of room.staff) map.set(s.id, { id: s.id, name: s.name, target: `room:${room.id}`, warning: null });
    }
  }
  for (const s of unassigned) if (!map.has(s.id)) map.set(s.id, { id: s.id, name: s.name, target: "", warning: null });
  return map;
}

export function StaffHousingClient({
  locations,
  unassigned,
  legacyUnmigratedCount
}: {
  locations: LocationData[];
  unassigned: UnassignedStaff[];
  legacyUnmigratedCount: number;
}) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(() => buildInitialAssignments(locations, unassigned));

  function patchAssignment(staffId: string, target: string, warning: string | null = null) {
    setAssignments((prev) => {
      const next = new Map(prev);
      const row = next.get(staffId);
      if (row) next.set(staffId, { ...row, target, warning });
      return next;
    });
  }

  const grouped = useMemo(() => {
    const byLocation = new Map<string, { direct: StaffAssignment[]; rooms: Map<string, StaffAssignment[]> }>();
    for (const loc of locations) {
      byLocation.set(loc.id, { direct: [], rooms: new Map(loc.rooms.map((r) => [r.id, []])) });
    }
    const unassignedRows: StaffAssignment[] = [];
    for (const row of assignments.values()) {
      if (!row.target) {
        unassignedRows.push(row);
        continue;
      }
      const [kind, id] = row.target.split(":");
      if (kind === "location") {
        byLocation.get(id)?.direct.push(row);
      } else if (kind === "room") {
        for (const bucket of byLocation.values()) {
          if (bucket.rooms.has(id)) bucket.rooms.get(id)!.push(row);
        }
      }
    }
    const sortByName = (a: StaffAssignment, b: StaffAssignment) => a.name.localeCompare(b.name);
    for (const bucket of byLocation.values()) {
      bucket.direct.sort(sortByName);
      for (const list of bucket.rooms.values()) list.sort(sortByName);
    }
    unassignedRows.sort(sortByName);
    return { byLocation, unassignedRows };
  }, [assignments, locations]);

  return (
    <div className="flex flex-col gap-5">
      {legacyUnmigratedCount > 0 ? <LegacyMigrationBanner count={legacyUnmigratedCount} onDone={() => router.refresh()} /> : null}

      <NewLocationForm onCreated={() => router.refresh()} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {locations.map((loc) => (
          <LocationCard
            key={loc.id}
            location={loc}
            directRows={grouped.byLocation.get(loc.id)?.direct ?? []}
            roomRows={grouped.byLocation.get(loc.id)?.rooms ?? new Map()}
            allLocations={locations}
            onAssignmentSaved={patchAssignment}
            onStructureChanged={() => router.refresh()}
          />
        ))}

        <Panel>
          <SectionHeader title="Unassigned" detail={`${grouped.unassignedRows.length} staff`} />
          <div className="mt-3 flex flex-col gap-2">
            {grouped.unassignedRows.map((row) => (
              <StaffAssignRow key={row.id} row={row} locations={locations} onSaved={(target, warning) => patchAssignment(row.id, target, warning ?? null)} />
            ))}
            {grouped.unassignedRows.length === 0 ? <p className="text-xs text-slate-400">Nobody here.</p> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function LegacyMigrationBanner({ count, onDone }: { count: number; onDone: () => void }) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await migrateLegacyHousingLabels();
      if (result.ok) onDone();
      else setError((result as { error?: string }).error ?? "Something went wrong.");
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-bold text-amber-900">
        {count} staff have an old free-text housing note that isn&apos;t linked to a location yet.
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className={`${buttonClass} min-h-9 px-3 py-1.5 text-xs`} onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Import as locations
        </button>
        {error ? <span className="text-xs font-bold text-red-700">{error}</span> : null}
      </div>
    </div>
  );
}

function NewLocationForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return;
    setError(null);
    const formData = new FormData();
    formData.set("name", name.trim());
    startTransition(async () => {
      const result = await createHousingLocation(formData);
      if (result.ok) {
        setName("");
        onCreated();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-soft sm:flex-row sm:items-center">
      <input
        className={`${inputClass} sm:max-w-xs`}
        placeholder="New location name (e.g. Barn Loft)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <button type="button" className={`${buttonClass} min-h-9 px-3 py-1.5 text-xs`} onClick={submit} disabled={busy || !name.trim()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Add location
      </button>
      {error ? <span className="text-xs font-bold text-red-700">{error}</span> : null}
    </div>
  );
}

function LocationCard({
  location,
  directRows,
  roomRows,
  allLocations,
  onAssignmentSaved,
  onStructureChanged
}: {
  location: LocationData;
  directRows: StaffAssignment[];
  roomRows: Map<string, StaffAssignment[]>;
  allLocations: LocationData[];
  onAssignmentSaved: (staffId: string, target: string, warning?: string | null) => void;
  onStructureChanged: () => void;
}) {
  const totalStaff = directRows.length + Array.from(roomRows.values()).reduce((sum, list) => sum + list.length, 0);
  const canDelete = location.rooms.length === 0 && totalStaff === 0;

  return (
    <Panel>
      <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <EditableLocationName location={location} onRenamed={onStructureChanged} />
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs font-bold text-slate-500">{totalStaff} staff</span>
          <DeleteButton
            disabled={!canDelete}
            title={canDelete ? "Delete location" : "Empty this location (and its rooms) first"}
            onDelete={async () => {
              const formData = new FormData();
              formData.set("id", location.id);
              return deleteHousingLocation(formData);
            }}
            onDeleted={onStructureChanged}
          />
        </div>
      </div>

      {location.rooms.length > 0 ? (
        <div className="flex flex-col gap-3">
          {location.rooms.map((room) => (
            <RoomBlock
              key={room.id}
              room={room}
              rows={roomRows.get(room.id) ?? []}
              allLocations={allLocations}
              onAssignmentSaved={onAssignmentSaved}
              onStructureChanged={onStructureChanged}
            />
          ))}
          {directRows.length > 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-2">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Not yet assigned to a room</p>
              <div className="flex flex-col gap-2">
                {directRows.map((row) => (
                  <StaffAssignRow key={row.id} row={row} locations={allLocations} onSaved={(target, warning) => onAssignmentSaved(row.id, target, warning ?? null)} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {directRows.map((row) => (
            <StaffAssignRow key={row.id} row={row} locations={allLocations} onSaved={(target, warning) => onAssignmentSaved(row.id, target, warning ?? null)} />
          ))}
          {directRows.length === 0 ? <p className="text-xs text-slate-400">Nobody here.</p> : null}
        </div>
      )}

      <AddRoomForm locationId={location.id} onAdded={onStructureChanged} />
    </Panel>
  );
}

/** Distinct from the shared CapacityPill: that component's "no limit"
 * case shows "Approval" (an activity-signup concept), which is meaningless
 * here -- a room simply not having a bed count set yet is normal. */
function RoomCapacityBadge({ count, bedCount }: { count: number; bedCount: number | null }) {
  if (bedCount == null) return <Badge tone="neutral">{count} in room</Badge>;
  if (count > bedCount) return <Badge tone="red">{count} / {bedCount}</Badge>;
  if (count === bedCount) return <Badge tone="amber">{count} / {bedCount}</Badge>;
  return <Badge tone="green">{count} / {bedCount}</Badge>;
}

function RoomBlock({
  room,
  rows,
  allLocations,
  onAssignmentSaved,
  onStructureChanged
}: {
  room: RoomData;
  rows: StaffAssignment[];
  allLocations: LocationData[];
  onAssignmentSaved: (staffId: string, target: string, warning?: string | null) => void;
  onStructureChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const canDelete = rows.length === 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <span className="truncate text-sm font-black text-slate-800">{room.name}</span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <RoomCapacityBadge count={rows.length} bedCount={room.bedCount} />
          <EditableRoom room={room} onSaved={onStructureChanged} />
          <DeleteButton
            disabled={!canDelete}
            title={canDelete ? "Delete room" : "Move staff out of this room first"}
            onDelete={async () => {
              const formData = new FormData();
              formData.set("id", room.id);
              return deleteHousingRoom(formData);
            }}
            onDeleted={onStructureChanged}
          />
        </div>
      </div>
      {expanded ? (
        <div className="mt-2 flex flex-col gap-2 pl-5">
          {rows.map((row) => (
            <StaffAssignRow key={row.id} row={row} locations={allLocations} onSaved={(target, warning) => onAssignmentSaved(row.id, target, warning ?? null)} />
          ))}
          {rows.length === 0 ? <p className="text-xs text-slate-400">Nobody here.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function EditableLocationName({ location, onRenamed }: { location: LocationData; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(location.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function save() {
    if (!name.trim() || name.trim() === location.name) {
      setEditing(false);
      setName(location.name);
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set("id", location.id);
    formData.set("name", name.trim());
    startTransition(async () => {
      const result = await renameHousingLocation(formData);
      if (result.ok) {
        setEditing(false);
        onRenamed();
      } else {
        setError(result.error);
      }
    });
  }

  if (!editing) {
    return (
      <button type="button" className="group flex items-center gap-1.5 text-left" onClick={() => setEditing(true)}>
        <h3 className="text-base font-black text-forest-900">{location.name}</h3>
        <Pencil className="h-3 w-3 text-slate-300 opacity-0 transition group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          className={`${inputClass} h-8 w-40 text-sm`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          autoFocus
        />
        <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={save} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-green-700" />}
        </button>
        <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => { setEditing(false); setName(location.name); setError(null); }}>
          <X className="h-3.5 w-3.5 text-slate-500" />
        </button>
      </div>
      {error ? <p className="text-xs font-bold text-red-700">{error}</p> : null}
    </div>
  );
}

function EditableRoom({ room, onSaved }: { room: RoomData; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [bedCount, setBedCount] = useState(room.bedCount != null ? String(room.bedCount) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function save() {
    if (!name.trim()) return;
    setError(null);
    const formData = new FormData();
    formData.set("id", room.id);
    formData.set("name", name.trim());
    formData.set("bedCount", bedCount.trim());
    startTransition(async () => {
      const result = await renameHousingRoom(formData);
      if (result.ok) {
        setEditing(false);
        onSaved();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <span className="relative inline-block">
      <button type="button" className="rounded p-1 hover:bg-slate-200" title="Edit room" onClick={() => setEditing((v) => !v)}>
        <Pencil className="h-3.5 w-3.5 text-slate-400" />
      </button>
      {editing ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Edit room</p>
          <div className="flex flex-col gap-2">
            <input className={`${inputClass} h-8 text-sm`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Room name" autoFocus />
            <input
              className={`${inputClass} h-8 text-sm`}
              value={bedCount}
              onChange={(e) => setBedCount(e.target.value)}
              placeholder="Bed count"
              inputMode="numeric"
            />
            {error ? <p className="text-xs font-bold text-red-700">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={`${secondaryButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={() => setEditing(false)}>Cancel</button>
              <button type="button" className={`${buttonClass} min-h-8 px-2 py-1 text-xs`} onClick={save} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </span>
  );
}

function AddRoomForm({ locationId, onAdded }: { locationId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [bedCount, setBedCount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return;
    setError(null);
    const formData = new FormData();
    formData.set("locationId", locationId);
    formData.set("name", name.trim());
    formData.set("bedCount", bedCount.trim());
    startTransition(async () => {
      const result = await createHousingRoom(formData);
      if (result.ok) {
        setName("");
        setBedCount("");
        setOpen(false);
        onAdded();
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <button type="button" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-lake-700 hover:text-lake-900" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add room
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 p-2.5 sm:flex-row sm:items-center">
      <input className={`${inputClass} h-8 flex-1 text-sm`} placeholder="Room name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <input
        className={`${inputClass} h-8 w-24 text-sm`}
        placeholder="Beds"
        value={bedCount}
        onChange={(e) => setBedCount(e.target.value)}
        inputMode="numeric"
      />
      <div className="flex items-center gap-2">
        <button type="button" className={`${buttonClass} min-h-8 px-2 py-1 text-xs`} onClick={submit} disabled={busy || !name.trim()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </button>
        <button type="button" className={`${secondaryButtonClass} min-h-8 px-2 py-1 text-xs`} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error ? <p className="text-xs font-bold text-red-700">{error}</p> : null}
    </div>
  );
}

function DeleteButton({
  disabled,
  title,
  onDelete,
  onDeleted
}: {
  disabled: boolean;
  title: string;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await onDelete();
      if (result.ok) {
        setConfirming(false);
        onDeleted();
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  if (disabled) {
    return (
      <button type="button" className="cursor-not-allowed rounded p-1 text-slate-200" title={title} disabled>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }

  if (!confirming) {
    return (
      <button type="button" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" title={title} onClick={() => setConfirming(true)}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {error ? <span className="text-xs font-bold text-red-700">{error}</span> : null}
      <button type="button" className={`${dangerButtonClass} min-h-7 px-2 py-0.5 text-xs`} onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm delete"}
      </button>
      <button type="button" className="rounded p-1 hover:bg-slate-100" onClick={() => { setConfirming(false); setError(null); }}>
        <X className="h-3.5 w-3.5 text-slate-500" />
      </button>
    </span>
  );
}

function StaffAssignRow({
  row,
  locations,
  onSaved
}: {
  row: StaffAssignment;
  locations: LocationData[];
  onSaved: (target: string, warning?: string | null) => void;
}) {
  const [value, setValue] = useState(row.target);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const warning = row.warning;

  function save(nextValue: string) {
    setValue(nextValue);
    setError(null);
    const formData = new FormData();
    formData.set("staffId", row.id);
    formData.set("target", nextValue);
    startTransition(async () => {
      const result = await assignStaffHousing(formData);
      if (result.ok) {
        onSaved(nextValue, result.warning);
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      } else {
        setError(result.error);
        setValue(row.target);
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <p className="mb-1 truncate text-sm font-bold text-slate-800">{row.name}</p>
      <div className="flex items-center gap-2">
        <select className={`${inputClass} h-9 flex-1 text-sm`} value={value} onChange={(e) => save(e.target.value)} disabled={busy}>
          <option value="">— Unassigned —</option>
          {locations.map((loc) =>
            loc.rooms.length > 0 ? (
              <optgroup key={loc.id} label={loc.name}>
                <option value={`location:${loc.id}`}>(no room assigned yet)</option>
                {loc.rooms.map((room) => (
                  <option key={room.id} value={`room:${room.id}`}>{room.name}</option>
                ))}
              </optgroup>
            ) : (
              <option key={loc.id} value={`location:${loc.id}`}>{loc.name}</option>
            )
          )}
        </select>
        {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" /> : null}
        {saved && !warning ? <Check className="h-4 w-4 shrink-0 text-green-600" /> : null}
      </div>
      {warning ? <p className="mt-1 text-xs font-bold text-amber-700">{warning}</p> : null}
      {error ? <p className="mt-1 text-xs font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
