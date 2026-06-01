import { Gender, Prisma, RegistrationStatus, RegistrationWindow, SwimLevel, Unit, UserRole } from "@prisma/client";
import { AppShell } from "@/components/app-shell";
import { EmptyState, PageHeader, inputClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERIOD_LABEL, SWIM_CODE, SWIM_LABEL, UNIT_LABEL } from "@/lib/periods";
import { REGISTRATION_WINDOW_LABEL } from "@/lib/registration-windows";
import { bulkUpdateCamperSwimLevels, setAllActiveCampersToMuskie, updateCamperCabin } from "./actions";
import { CamperManagementClient } from "./camper-management-client";

const activeRegistration = [RegistrationStatus.ACTIVE, RegistrationStatus.OVERRIDDEN];
const noCabinValue = "__NO_CABIN__";

type CamperSearchParams = {
  q?: string | string[];
  unit?: string | string[];
  gender?: string | string[];
  cabin?: string | string[];
  swimLevel?: string | string[];
  window?: string | string[];
};

type FilterOption = {
  value: string;
  label: string;
  description?: string;
};

function asArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

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

function filterHrefWithout(name: keyof CamperSearchParams) {
  return `/admin/campers${name ? "" : ""}`;
}

function FilterPills({ name, label, options, selected }: { name: string; label: string; options: FilterOption[]; selected: string[] }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-bold text-forest-900">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <label key={option.value} className="cursor-pointer">
              <input className="peer sr-only" defaultChecked={isSelected} name={name} type="checkbox" value={option.value} />
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white hover:border-lake-300">
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default async function CamperManagementPage({ searchParams }: { searchParams?: Promise<CamperSearchParams> }) {
  const user = await requireUser([UserRole.EXECUTIVE_ADMIN]);
  const params = searchParams ? await searchParams : {};
  const search = firstParam(params.q)?.trim() ?? "";
  const selectedUnits = selectedEnumValues(asArray(params.unit), Object.values(Unit));
  const selectedGenders = selectedEnumValues(asArray(params.gender), Object.values(Gender));
  const selectedSwimLevels = selectedEnumValues(asArray(params.swimLevel), Object.values(SwimLevel));
  const selectedWindows = selectedEnumValues(asArray(params.window), Object.values(RegistrationWindow));
  const visibleWindows = selectedWindows.length ? selectedWindows : Object.values(RegistrationWindow);
  const selectedCabins = asArray(params.cabin);
  const session = await prisma.session.findFirst({ where: { active: true } });
  const cabins = await prisma.cabin.findMany({ orderBy: [{ unit: "asc" }, { name: "asc" }] });

  const camperWhere: Prisma.CamperWhereInput = session ? { sessionId: session.id, active: true } : { id: "__NO_ACTIVE_SESSION__" };
  const andFilters: Prisma.CamperWhereInput[] = [];

  if (search) {
    andFilters.push({
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } }
      ]
    });
  }

  if (selectedUnits.length) andFilters.push({ unit: { in: selectedUnits } });
  if (selectedGenders.length) andFilters.push({ gender: { in: selectedGenders } });
  if (selectedSwimLevels.length) andFilters.push({ swimLevel: { in: selectedSwimLevels } });
  if (selectedWindows.length) {
    andFilters.push({ registrations: { some: { registrationWindow: { in: selectedWindows }, status: { in: activeRegistration } } } });
  }

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

  const unitOptions = Object.values(Unit).map((unit) => ({ value: unit, label: UNIT_LABEL[unit] }));
  const genderOptions = Object.values(Gender).map((gender) => ({ value: gender, label: formatEnumLabel(gender) }));
  const swimOptions = Object.values(SwimLevel).map((level) => ({ value: level, label: SWIM_LABEL[level] }));
  const windowOptions = Object.values(RegistrationWindow).map((window) => ({ value: window, label: REGISTRATION_WINDOW_LABEL[window] }));
  const cabinOptions = [
    { value: noCabinValue, label: "No cabin" },
    ...cabins.map((cabin) => ({ value: cabin.id, label: `${cabin.name} - ${UNIT_LABEL[cabin.unit]}` }))
  ];

  return (
    <AppShell user={user}>
      <PageHeader title="Camper Management" eyebrow={session?.name ?? "No active session"} />

      <form className="mb-6 grid gap-5 rounded-lg border border-white bg-white p-5 shadow-soft" method="get">
        <label className="grid gap-1.5 text-sm font-bold text-forest-900">
          Search camper name
          <input className={inputClass} defaultValue={search} name="q" placeholder="First or last name" />
        </label>

        <div className="grid gap-5 xl:grid-cols-2">
          <FilterPills label="Units" name="unit" options={unitOptions} selected={selectedUnits} />
          <FilterPills label="Gender" name="gender" options={genderOptions} selected={selectedGenders} />
          <FilterPills label="Cabin" name="cabin" options={cabinOptions} selected={selectedCabins} />
          <FilterPills label="Swim level" name="swimLevel" options={swimOptions} selected={selectedSwimLevels} />
          <FilterPills label="Registration window" name="window" options={windowOptions} selected={selectedWindows} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-900" type="submit">
            Apply filters
          </button>
          <a className={secondaryButtonClass} href={filterHrefWithout("q")}>Reset</a>
          <p className="text-sm font-medium text-slate-500">Showing {campers.length} active camper{campers.length === 1 ? "" : "s"}.</p>
        </div>
      </form>

      {!session ? (
        <EmptyState title="No active session" body="Create or activate a session before managing campers." />
      ) : campers.length ? (
        <CamperManagementClient
          bulkUpdateAction={bulkUpdateCamperSwimLevels}
          cabins={cabins.map((cabin) => ({ value: cabin.id, label: `${cabin.name} - ${UNIT_LABEL[cabin.unit]}` }))}
          campers={campers.map((camper) => ({
            id: camper.id,
            name: `${camper.firstName} ${camper.lastName}`,
            cabinId: camper.cabinId,
            cabinName: camper.cabin?.name ?? "No cabin",
            gender: formatEnumLabel(camper.gender),
            unit: UNIT_LABEL[camper.unit],
            swimLabel: SWIM_LABEL[camper.swimLevel],
            swimCode: SWIM_CODE[camper.swimLevel],
            status: formatEnumLabel(camper.status),
            medicalFlags: camper.medicalFlags,
            registrations: camper.registrations.map((registration) => ({
              id: registration.id,
              registrationWindow: registration.registrationWindow,
              period: PERIOD_LABEL[registration.period],
              activity: registration.offering.activity.name,
              area: registration.offering.area.name,
              status: formatEnumLabel(registration.status)
            }))
          }))}
          setAllMuskieAction={setAllActiveCampersToMuskie}
          swimOptions={swimOptions}
          updateCabinAction={updateCamperCabin}
          visibleWindowValues={visibleWindows}
          windows={windowOptions}
        />
      ) : (
        <EmptyState title="No campers match these filters" body="Try removing one or two filters, or import campers for the active session." />
      )}
    </AppShell>
  );
}
