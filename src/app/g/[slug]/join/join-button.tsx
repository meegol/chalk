"use client";

import { useActionState } from "react";
import { Button, Notice } from "@/components/ui";
import type { ActionState } from "@/lib/utils";

export function JoinButton({ action }: { action: (state: ActionState) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      <Button disabled={pending}>{pending ? "Joining…" : "Join gym"}</Button>
    </form>
  );
}
