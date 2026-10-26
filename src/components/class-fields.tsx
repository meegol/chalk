import { Field, Input, Select } from "./ui";

export function CoachSelect({ coaches, defaultValue }: { coaches: { id: string; name: string }[]; defaultValue?: string | null }) {
  return (
    <Field label="Coach">
      <Select name="coachId" defaultValue={defaultValue ?? ""}>
        <option value="">No coach yet</option>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function TimingFields() {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label="Start">
        <Input name="startTime" type="time" required defaultValue="06:00" />
      </Field>
      <Field label="Minutes">
        <Input name="durationMin" type="number" inputMode="numeric" min={15} max={240} defaultValue={60} required />
      </Field>
      <Field label="Spots">
        <Input name="capacity" type="number" inputMode="numeric" min={1} max={100} defaultValue={16} required />
      </Field>
    </div>
  );
}
