import { Gender, Prisma, RegistrationStatus, RegistrationWindow, SwimLevel, Unit, UserRole, WeekBlock } from "@prisma/client";
import { CalendarDays, Check, MoreHorizontal, Star } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asParamArray, camperPoolWhere, resolveCamperPoolFilters, WEEK_BLOCK_LABEL } from "@/lib/camper-filter-groups";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_CODE, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";
import { archiveCamperFilterGroup, bulkUpdateCamperSwimLevels, createCamper, createCamperFilterGroup, deleteCamper, setAllActiveCampersToMuskie, setAllActiveCampersToPendingSwimTest, updateCamperAllergies, updateCamperCabin, updateCamperCounselorAssistant, updateCamperMedicalFlags, updateCamperNickname, updateCamperSwimLevel, updateCamperUnit } from "./actions";
import { CamperManagementClient } from "./camper-management-client";

const activeRegistration: RegistrationStatus[] = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const allUnits = Object.values(Unit) as Unit[];
const allGenders = Object.values(Gender) as Gender[];
const allSwimLevels = Object.values(SwimLevel) as SwimLevel[];
const allRegistrationWindows = Object.values(RegistrationWindow) as RegistrationWindow[];
const allWeekBlocks = Object.values(WeekBlock) as WeekBlock[];
const noCabinValue = "__NO_CABIN__";

type CamperSearchParams = {
  q?: string | string[];
  expand?: string | string[];
  unit?: string | string[];
  gender?: string | string[];
  cabin?: string | string[];
  swimLevel?: string | string[];
  window?: string | string[];
  weekBlock?: string | string[];
  designation?: string | string[];
  group?: string | string[];
  sessionId?: string | string[];
};

type FilterOption = {
  value: string;
  label: string;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function selectedEnumValues<T extends string>(values: string[], allowed: T[]) {
  return values.filter((value): value is T => allowed.includes(value as T));
}

function formatEnumLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function FilterPills({ name, label, options, selected }: { name: string; label: string; options: FilterOption[]; selected: string[] }) {
  return (
    <fieldset className="grid gap-2 border-r border-slate-200 pr-5 last:border-r-0">
      <legend className="text-xs font-black text-slate-950">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <label key={option.value} className="cursor-pointer">
              <input className="peer sr-only" defaultChecked={isSelected} name={name} type="checkbox" value={option.value} />
              <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-700 transition peer-checked:border-green-300 peer-checked:bg-green-50 peer-checked:text-forest-900 hover:border-lake-300">
                <span className={`grid h-4 w-4 place-items-center rounded border text-[10px] ${isSelected ? "border-forest-700 bg-forest-700 text-white" : "border-slate-300 bg-white text-transparent"}`}><Check className="h-3 w-3" /></span>
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

const defaultAllergyLabels = [
  ["Milk", "Major food allergen"],
  ["Eggs", "Major food allergen"],
  ["Fish", "Major food allergen"],
  ["Crustacean shellfish", "Major food allergen"],
  ["Tree nuts", "Major food allergen"],
  ["Peanuts", "Major food allergen"],
  ["Wheat", "Major food allergen"],
  ["Soybeans", "Major food allergen"],
  ["Sesame", "Major food allergen"],
  ["Bees", "Environmental"],
  ["Pollen", "Environmental"]
] as const;

async function ensureDefaultAllergyLabels() {
  for (const [name, category] of defaultAllergyLabels) {
    await prisma.allergyLabel.upsert({
      where: { name },
      create: { name, category },
      update: { active: true, category }
    });
  }
  return prisma.allergyLabel.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

export default async function CamperManagementPage({ searchParams }: { searchParams?: Promise<CamperSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  // `q` is no longer a server-side filter: the full camper list already ships
  // to the client, so name search is instant client-side filtering in
  // CamperManagementClient. We still parse it here to seed the search box for
  // deep links (dashboard quick search, older bookmarks). `expand` deep-links
  // straight to one camper's editor (global search typeahead uses this).
  const search = firstParam(params.q)?.trim() ?? "";
  const expandId = firstParam(params.expand)?.trim() ?? "";
  const selectedUnits = selectedEnumValues(asParamArray(params.unit), allUnits);
  const selectedGenders = selectedEnumValues(asParamArray(params.gender), allGenders);
  const selectedSwimLevels = selectedEnumValues(asParamArray(params.swimLevel), allSwimLevels);
  const selectedWindows = selectedEnumValues(asParamArray(params.window), allRegistrationWindows);
  const selectedCabins = asParamArray(params.cabin);
  const requestedSessionId = firstParam(params.sessionId)?.trim();
  const [session, allSessions] = await Promise.all([
    requestedSessionId
      ? prisma.session.findUnique({ where: { id: requestedSessionId } })
      : prisma.session.findFirst({ where: { active: true } }),
    prisma.session.findMany({ select: { id: true, name: true, cycle: true, year: true, active: true }, orderBy: { createdAt: "desc" } })
  ]);
  const [cabins, designationRows, filterGroups, allergyLabels] = await Promise.all([
    prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] }),
    prisma.camperSessionDesignation.findMany({
      where: session ? { camper: { sessionId: session.id, active: true } } : { id: "__NO_ACTIVE_SESSION__" },
      distinct: ["label"],
      orderBy: { label: "asc" }
    }),
    session
      ? prisma.camperFilterGroup.findMany({ where: { sessionId: session.id, active: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    ensureDefaultAllergyLabels()
  ]);
  const { selectedGroupIds, weekBlocks: selectedWeekBlocks, designations: selectedDesignations } = resolveCamperPoolFilters(params, filterGroups);
  const visibleWindows = selectedWindows.length ? selectedWindows : allRegistrationWindows;

  const camperWhere: Prisma.CamperWhereInput = session ? { sessionId: session.id, active: true } : { id: "__NO_ACTIVE_SESSION__" };
  const andFilters: Prisma.CamperWhereInput[] = [];

  if (selectedUnits.length) andFilters.push({ unit: { in: selectedUnits } });
  if (selectedGenders.length) andFilters.push({ gender: { in: selectedGenders } });
  if (selectedSwimLevels.length) andFilters.push({ swimLevel: { in: selectedSwimLevels } });
  if (selectedWindows.length) {
    andFilters.push({ registrations: { some: { registrationWindow: { in: selectedWindows }, status: { in: activeRegistration } } } });
  }

  const poolWhere = camperPoolWhere({ weekBlocks: selectedWeekBlocks, designations: selectedDesignations });
  if (poolWhere.OR) andFilters.push(poolWhere);

  if (selectedCabins.length) {
    const realCabinIds = selectedCabins.filter((id) => id !== noCabinValue);
    const cabinFilters: Prisma.CamperWhereInput[] = [];
    if (realCabinIds.length) cabinFilters.push({ cabinId: { in: realCabinIds } });
    if (selectedCabins.includes(noCabinValue)) cabinFilters.push({ cabinId: null });
    if (cabinFilters.length) andFilters.push({ OR: cabinFilters });
  }

  if (andFilters.length) camperWhere.AND = andFilters;

  const campers = await prisma.camper.findMany({
    where: camperWhere,
    include: {
      cabin: true,
      weekEnrollments: { include: { cabin: true }, orderBy: { weekBlock: "asc" } },
      sessionDesignations: { orderBy: { label: "asc" } },
      allergies: { include: { allergyLabel: true }, orderBy: { allergyLabel: { name: "asc" } } },
      registrations: {
        include: {
          offering: {
            include: {
              activity: true,
              area: true
            }
          }
        },
        orderBy: [{ registrationWindow: "asc" }, { period: "asc" }]
      }
    },
    orderBy: [{ cabin: { name: "asc" } }, { lastName: "asc" }, { firstName: "asc" }]
  });

  const unitOptions = allUnits.map((unit) => ({ value: unit, label: UNIT_LABEL[unit] }));
  const genderOptions = allGenders.map((gender) => ({ value: gender, label: formatEnumLabel(gender) }));
  const swimOptions = allSwimLevels.map((level) => ({ value: level, label: SWIM_LABEL[level] }));
  const windowOptions = allRegistrationWindows.map((window) => ({ value: window, label: REGISTRATION_WINDOW_LABEL[window] }));
  const weekBlockOptions = allWeekBlocks.map((weekBlock) => ({ value: weekBlock, label: WEEK_BLOCK_LABEL[weekBlock] }));
  const designationOptions = designationRows.map((row) => ({ value: row.label, label: row.label }));
  const cabinOptions = [
    { value: noCabinValue, label: "No cabin" },
    ...cabins.map((cabin) => ({ value: cabin.id, label: `${cabin.name} - ${UNIT_LABEL[cabin.unit]}` }))
  ];

  // The filter panel collapses by default (day-to-day use is name search);
  // it opens automatically whenever any server-side filter is live so an
  // active filter is never invisibly narrowing the list.
  const activeFilterCount =
    selectedUnits.length +
    selectedGenders.length +
    selectedCabins.length +
    selectedSwimLevels.length +
    selectedWindows.length +
    selectedWeekBlocks.length +
    selectedDesignations.length +
    selectedGroupIds.length;

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-forest-900">Camper Management</h1>
          <p className="mt-1 text-base text-slate-600">Manage camper profiles, cabins, swim levels, session pools, and registration history.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm"><CalendarDays className="h-4 w-4" />{session?.name ?? "No Session"}</span>
          <Badge tone={session?.active ? "green" : session ? "blue" : "amber"}>{session?.active ? "Active Session" : session ? "Not Active" : "No Session"}</Badge>
        </div>
      </div>

      {allSessions.length > 1 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-panel">
          <span className="font-black text-slate-600">Managing campers for:</span>
          {allSessions.map((s) => (
            <a
              key={s.id}
              href={`/admin/campers?sessionId=${s.id}`}
              className={`rounded-md border px-3 py-1.5 text-xs font-black ${session?.id === s.id ? "border-forest-700 bg-forest-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {s.name} — {s.cycle} {s.year}{s.active ? " (active)" : ""}
            </a>
          ))}
        </div>
      ) : null}
      {session && !session.active ? (
        <div className="mb-5 rounded-lg border border-lake-200 bg-lake-50 p-3 text-sm font-bold text-lake-900">
          You&apos;re managing campers in {session.name}, which is not the active session — nothing here affects what other users see until it&apos;s switched on in Camp Structure.
        </div>
      ) : null}

      {session ? (
        <details className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-panel">
          <summary className="cursor-pointer list-none text-lg font-black text-forest-900">Add Camper</summary>
          <form action={createCamper} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input name="sessionId" type="hidden" value={session.id} />
            <Field label="First name">
              <input className={inputClass} name="firstName" required />
            </Field>
            <Field label="Last name">
              <input className={inputClass} name="lastName" required />
            </Field>
            <Field label="Gender">
              <select className={inputClass} name="gender" required defaultValue="">
                <option value="" disabled>Choose gender</option>
                {genderOptions.map((gender) => <option key={gender.value} value={gender.value}>{gender.label}</option>)}
              </select>
            </Field>
            <Field label="Unit">
              <select className={inputClass} name="unit" required defaultValue="">
                <option value="" disabled>Choose unit</option>
                {unitOptions.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
              </select>
            </Field>
            <Field label="Cabin">
              <select className={inputClass} name="cabinId" defaultValue="">
                <option value="">No cabin</option>
                {cabins.map((cabin) => <option key={cabin.id} value={cabin.id}>{cabin.name} - {UNIT_LABEL[cabin.unit]}</option>)}
              </select>
            </Field>
            <Field label="Swim level">
              <select className={inputClass} name="swimLevel" defaultValue={SwimLevel.PENDING_SWIM_TEST}>
                {swimOptions.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
              </select>
            </Field>
            <Field label="Age">
              <input className={inputClass} name="age" step="0.01" type="number" />
            </Field>
            <Field label="Camp grade">
              <input className={inputClass} name="campGrade" />
            </Field>
            <Field label="Gender identity">
              <input className={inputClass} name="genderIdentity" />
            </Field>
            <Field label="Medical / allergy notes">
              <input className={inputClass} name="medicalFlags" placeholder="Optional quick note" />
            </Field>
            <fieldset className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">
              <legend className="px-1 text-sm font-black text-slate-700">Week blocks for selected cabin</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {weekBlockOptions.map((weekBlock) => (
                  <label key={weekBlock.value} className="cursor-pointer">
                    <input className="peer sr-only" name="weekBlock" type="checkbox" value={weekBlock.value} />
                    <span className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">{weekBlock.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700">
              <input name="counselorAssistant" type="checkbox" />
              Counselor Assistant
            </label>
            <div className="flex items-end">
              <button className={buttonClass} type="submit">Add camper</button>
            </div>
          </form>
        </details>
      ) : null}

      <details className="mb-5 rounded-xl border border-slate-200 bg-white shadow-panel" open={activeFilterCount > 0}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
          <span className="flex items-center gap-3 text-lg font-black text-forest-900">
            Filters &amp; registration pools
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-lake-600 px-2.5 py-0.5 text-xs font-black text-white">{activeFilterCount} active</span>
            ) : (
              <span className="text-sm font-medium text-slate-400">none active</span>
            )}
          </span>
          <MoreHorizontal className="h-5 w-5 text-slate-400" />
        </summary>
        <div className="grid gap-5 border-t border-slate-200 p-4">
        <form className="grid gap-5" method="get">
        {/* Keeps the (client-side) search text and session context from being
          * lost when filters are applied -- the client component syncs the
          * hidden q field as you type. */}
        <input defaultValue={search} id="camper-q-hidden" name="q" type="hidden" />
        {requestedSessionId ? <input name="sessionId" type="hidden" value={requestedSessionId} /> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <a className={secondaryButtonClass} href="/admin/campers">Clear Filters</a>
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-lake-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-lake-700" type="submit">Apply Filters</button>
        </div>

        {filterGroups.length ? (
          <fieldset className="rounded-xl border border-lake-100 bg-lake-50/50 p-3">
            <legend className="px-1 text-xs font-black text-forest-900">Saved registration groups</legend>
            <div className="flex flex-wrap gap-2">
              {filterGroups.map((group) => {
                const isSelected = selectedGroupIds.includes(group.id);
                return (
                  <label key={group.id} className="cursor-pointer">
                    <input className="peer sr-only" defaultChecked={isSelected} name="group" type="checkbox" value={group.id} />
                    <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-lake-100 bg-white px-3 py-1.5 text-sm font-black text-forest-900 peer-checked:border-lake-600 peer-checked:bg-lake-600 peer-checked:text-white">
                      <Star className="h-4 w-4" />
                      {group.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[1.1fr_1.05fr_1.55fr_1.2fr_1.1fr]">
          <FilterPills label="Units" name="unit" options={unitOptions} selected={selectedUnits} />
          <FilterPills label="Gender" name="gender" options={genderOptions} selected={selectedGenders} />
          <FilterPills label="Cabin" name="cabin" options={cabinOptions} selected={selectedCabins} />
          <FilterPills label="Swim level" name="swimLevel" options={swimOptions} selected={selectedSwimLevels} />
          <FilterPills label="Registration window" name="window" options={windowOptions} selected={selectedWindows} />
        </div>
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.4fr]">
          <FilterPills label="Operational week blocks" name="weekBlock" options={weekBlockOptions} selected={selectedWeekBlocks} />
          <FilterPills label="Session designations from import" name="designation" options={designationOptions} selected={selectedDesignations} />
        </div>
        </form>

        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-lg font-black text-forest-900">Save Current Pool</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Save selected week blocks and session designations as a reusable registration group.</p>
          </div>
          <form action={createCamperFilterGroup} className="grid flex-1 gap-3 lg:grid-cols-[1fr_1fr_auto]">
            {session ? <input name="sessionId" type="hidden" value={session.id} /> : null}
            {selectedWeekBlocks.map((weekBlock) => <input key={weekBlock} name="weekBlock" type="hidden" value={weekBlock} />)}
            {selectedDesignations.map((designation) => <input key={designation} name="designation" type="hidden" value={designation} />)}
            <input className={inputClass} name="groupName" placeholder="Example: Q1 Registration Pool" />
            <input className={inputClass} name="groupDescription" placeholder="Optional note" />
            <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-forest-800 px-4 text-sm font-black text-white" type="submit">Save Group</button>
          </form>
        </div>
        {filterGroups.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {filterGroups.map((group) => (
              <form key={group.id} action={archiveCamperFilterGroup}>
                <input name="groupId" type="hidden" value={group.id} />
                <button className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-600" type="submit">Archive {group.name}</button>
              </form>
            ))}
          </div>
        ) : null}
        </section>
        </div>
      </details>

      {!session ? (
        <EmptyState title="No session selected" body="Create a session on the Camp Structure page, then pick it above to manage campers." />
      ) : campers.length ? (
        <CamperManagementClient
          sessionId={session.id}
          initialQuery={search}
          initialExpandId={expandId}
          bulkUpdateAction={bulkUpdateCamperSwimLevels}
          cabins={cabins.map((cabin) => ({ value: cabin.id, label: `${cabin.name} - ${UNIT_LABEL[cabin.unit]}` }))}
          campers={campers.map((camper) => ({
            id: camper.id,
            name: `${camper.firstName} ${camper.lastName}`,
            nickname: camper.nickname,
            cabinId: camper.cabinId,
            cabinName: camper.cabin?.name ?? "No cabin",
            gender: formatEnumLabel(camper.gender),
            unit: UNIT_LABEL[camper.unit],
            unitValue: camper.unit,
            swimLabel: SWIM_LABEL[camper.swimLevel],
            swimCode: SWIM_CODE[camper.swimLevel],
            swimValue: camper.swimLevel,
            status: formatEnumLabel(camper.status),
            age: camper.age,
            campGrade: camper.campGrade,
            genderIdentity: camper.genderIdentity,
            counselorAssistant: camper.counselorAssistant,
            weeks: camper.weekEnrollments.map((week) => ({
              block: WEEK_BLOCK_LABEL[week.weekBlock],
              cabin: week.cabin?.name ?? week.cabinName ?? "No cabin"
            })),
            designations: camper.sessionDesignations.map((designation) => designation.label),
            allergies: camper.allergies.map((allergy) => ({
              id: allergy.allergyLabel.id,
              name: allergy.allergyLabel.name,
              category: allergy.allergyLabel.category,
              notes: allergy.notes
            })),
            medicalFlags: camper.medicalFlags,
            updatedAt: camper.updatedAt.toISOString(),
            registrations: camper.registrations.map((registration) => ({
              id: registration.id,
              registrationWindow: registration.registrationWindow,
              period: PERIOD_LABEL[registration.period],
              activity: registration.offering.activity.name,
              area: registration.offering.area.name,
              role: formatEnumLabel(registration.registrationRole),
              status: formatEnumLabel(registration.status)
            }))
          }))}
          setAllMuskieAction={setAllActiveCampersToMuskie}
          setAllPendingSwimTestAction={setAllActiveCampersToPendingSwimTest}
          allergyOptions={allergyLabels.map((allergy) => ({ value: allergy.id, label: allergy.name, category: allergy.category ?? "Other" }))}
          deleteCamperAction={deleteCamper}
          swimOptions={swimOptions}
          updateAllergiesAction={updateCamperAllergies}
          updateCabinAction={updateCamperCabin}
          updateUnitAction={updateCamperUnit}
          updateSwimLevelAction={updateCamperSwimLevel}
          updateNicknameAction={updateCamperNickname}
          unitOptions={unitOptions}
          updateCounselorAssistantAction={updateCamperCounselorAssistant}
          updateMedicalAction={updateCamperMedicalFlags}
          visibleWindowValues={visibleWindows}
          windows={windowOptions}
        />
      ) : (
        <EmptyState title="No campers match these filters" body="Try removing one or two filters, or import campers for this session." />
      )}
    </AppShell>
  );
}
