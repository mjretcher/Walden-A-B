"use client";

import { useMemo, useState } from "react";
import { buttonClass, inputClass } from "@/components/ui";

type CamperQuickSearchItem = {
  id: string;
  name: string;
  cabinName: string;
  registrationCount: number;
};

export function CamperQuickSearch({ campers }: { campers: CamperQuickSearchItem[] }) {
  const [search, setSearch] = useState("");
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const matches = useMemo(() => {
    if (!terms.length) return [];

    return campers
      .filter((camper) => {
        const searchable = `${camper.name} ${camper.cabinName}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
      .slice(0, 8);
  }, [campers, terms]);

  const searchUrl = `/admin/campers?q=${encodeURIComponent(search.trim())}`;

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          className={`${inputClass} flex-1 bg-white`}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Type camper first, last, full name, or cabin"
          value={search}
        />
        <a className={buttonClass} href={search.trim() ? searchUrl : "/admin/campers"}>
          Open in Camper Management
        </a>
      </div>

      {search.trim() ? (
        matches.length ? (
          <div className="overflow-hidden rounded-xl border border-lake-200 bg-white shadow-soft">
            {matches.map((camper) => (
              <a
                className="flex flex-col gap-1 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-lake-50 sm:flex-row sm:items-center sm:justify-between"
                href={`/admin/campers?q=${encodeURIComponent(camper.name)}`}
                key={camper.id}
              >
                <span>
                  <span className="block font-bold text-forest-900">{camper.name}</span>
                  <span className="text-sm text-slate-500">{camper.cabinName}</span>
                </span>
                <span className="text-sm font-semibold text-lake-800">{camper.registrationCount} active registration{camper.registrationCount === 1 ? "" : "s"}</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">No dashboard matches for “{search}”. Try a first name, last name, or cabin.</p>
        )
      ) : null}
    </div>
  );
}
