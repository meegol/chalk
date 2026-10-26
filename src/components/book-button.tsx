"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/utils";
import { Button } from "./ui";

type Props = {
  action: (state: ActionState) => Promise<ActionState>;
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  confirm?: string;
};

/** One-tap booking action with inline feedback under the button. */
export function BookButton({ action, label, variant = "primary", confirm }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [armed, setArmed] = useState(false);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !armed) {
          e.preventDefault();
          setArmed(true);
        }
      }}
      className="flex flex-col gap-1"
    >
      <Button variant={armed ? "danger" : variant} size="sm" disabled={pending} className="h-11">
        {pending ? "…" : armed ? confirm : label}
      </Button>
      {state?.error && <p className="text-xs font-semibold text-red">{state.error}</p>}
      {state?.ok && <p className="text-xs font-semibold text-green">{state.ok}</p>}
    </form>
  );
}
