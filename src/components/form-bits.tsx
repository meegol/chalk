"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/utils";
import { Button, Notice } from "./ui";

/** A form wired to a server action that reports `{ error | ok }` inline. */
export function ActionForm({
  action,
  children,
  submit,
  className,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  submit: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "flex flex-col gap-4"}>
      {children}
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      {state?.ok && <Notice tone="green">{state.ok}</Notice>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submit}
      </Button>
    </form>
  );
}
