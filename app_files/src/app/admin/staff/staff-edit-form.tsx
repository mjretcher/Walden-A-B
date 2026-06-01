import { inputClass } from "@/components/ui";
import { updateStaffProfile } from "./actions";

type Option = {
  value: string;
  label: string;
};

type StaffEditFormProps = {
  staffId: string;
  cabinId: string | null;
  primaryAreaId: string | null;
  secondaryAreaIds: string[];
  certificationIds: string[];
  skillIds: string[];
  cabins: Option[];
  areas: Option[];
  certifications: Option[];
  skills: Option[];
};

function EditChecks({ name, label, options, selected }: { name: string; label: string; options: Option[]; selected: string[] }) {
  return (
    <fieldset className="grid gap-2 rounded-md border border-slate-200 bg-white p-3">
      <legend className="px-1 text-sm font-bold text-forest-900">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className="cursor-pointer">
            <input className="peer sr-only" defaultChecked={selected.includes(option.value)} name={name} type="checkbox" value={option.value} />
            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition peer-checked:border-forest-700 peer-checked:bg-forest-700 peer-checked:text-white hover:border-lake-300">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function StaffEditForm({
  staffId,
  cabinId,
  primaryAreaId,
  secondaryAreaIds,
  certificationIds,
  skillIds,
  cabins,
  areas,
  certifications,
  skills
}: StaffEditFormProps) {
  return (
    <form action={updateStaffProfile} className="mt-4 grid gap-4">
      <input name="staffId" type="hidden" value={staffId} />
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Cabin
          <select className={inputClass} defaultValue={cabinId ?? ""} name="cabinId">
            <option value="">No cabin</option>
            {cabins.map((cabin) => <option key={cabin.value} value={cabin.value}>{cabin.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Primary area
          <select className={inputClass} defaultValue={primaryAreaId ?? ""} name="primaryAreaId">
            <option value="">No primary area</option>
            {areas.map((area) => <option key={area.value} value={area.value}>{area.label}</option>)}
          </select>
        </label>
      </div>
      <EditChecks label="Secondary areas" name="secondaryAreaId" options={areas} selected={secondaryAreaIds} />
      <EditChecks label="Certifications" name="certificationId" options={certifications} selected={certificationIds} />
      <EditChecks label="Skills" name="skillId" options={skills} selected={skillIds} />
      <div>
        <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-forest-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest-900" type="submit">Save staff details</button>
      </div>
    </form>
  );
}
