"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";

type Defaults = {
  name?: string;
  kind?: "monthly" | "pack" | "dropin";
  priceCents?: number;
  credits?: number | null;
  validDays?: number | null;
  description?: string | null;
};

export function PlanFields({ defaults = {} }: { defaults?: Defaults }) {
  const [kind, setKind] = useState(defaults.kind ?? "monthly");
  return (
    <>
      <Field label="Name">
        <Input name="name" required defaultValue={defaults.name} placeholder="Unlimited" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="monthly">Monthly</option>
            <option value="pack">Class pack</option>
            <option value="dropin">Drop-in</option>
          </Select>
        </Field>
        <Field label={kind === "monthly" ? "Price / month" : "Price"}>
          <Input
            name="price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="1"
            required
            defaultValue={defaults.priceCents ? defaults.priceCents / 100 : undefined}
          />
        </Field>
      </div>
      {kind === "pack" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Classes">
            <Input name="credits" type="number" inputMode="numeric" min="1" defaultValue={defaults.credits ?? 10} />
          </Field>
          <Field label="Valid for (days)">
            <Input name="validDays" type="number" inputMode="numeric" min="1" defaultValue={defaults.validDays ?? 90} />
          </Field>
        </div>
      )}
      <Field label="Description">
        <Input name="description" defaultValue={defaults.description ?? undefined} placeholder="Optional" />
      </Field>
    </>
  );
}
