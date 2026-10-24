"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { slugify } from "@/lib/utils";
import { createGym } from "./actions";

export function GymForm({ timezones }: { timezones: string[] }) {
  const [state, action, pending] = useActionState(createGym, undefined);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Gym name">
        <Input
          name="name"
          required
          value={name}
          placeholder="Ironside Strength"
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
        />
      </Field>
      <Field label="Address" hint={`Members book at /g/${slug || "your-gym"}`}>
        <div className="flex h-12 items-center rounded-sm border border-line bg-surface focus-within:border-ink">
          <span className="pl-3 font-mono text-sm text-ink-soft">/g/</span>
          <input
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(slugify(e.target.value));
            }}
            className="h-full flex-1 bg-transparent pr-3 font-mono outline-none"
          />
        </div>
      </Field>
      <Field label="Timezone" hint="Class times are shown in this timezone.">
        <Select name="timezone" defaultValue={timezones.includes(tz) ? tz : "UTC"}>
          {timezones.map((t) => (
            <option key={t} value={t}>
              {t.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </Field>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Setting up…" : "Create gym"}
      </Button>
    </form>
  );
}
