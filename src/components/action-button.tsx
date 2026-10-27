"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/utils";
import { Button, Notice } from "./ui";

/** A single button bound to a server action that may redirect or return an error. */
export function ActionButton({
  action,
  children,
  variant = "primary",
  pendingLabel = "Opening Stripe…",
}: {
  action: () => Promise<ActionState>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Button variant={variant} disabled={pending} className="w-full sm:w-auto">
        {pending ? pendingLabel : children}
      </Button>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
    </form>
  );
}
