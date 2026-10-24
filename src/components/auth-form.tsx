"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/utils";
import { Button, Field, Input, Notice } from "./ui";

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  mode: "sign-in" | "sign-up";
  next?: string;
  email?: string;
};

export function AuthForm({ action, mode, next, email }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "sign-up" && (
        <Field label="Name">
          <Input name="name" autoComplete="name" required />
        </Field>
      )}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" defaultValue={email} required />
      </Field>
      <Field label="Password" hint={mode === "sign-up" ? "At least 8 characters" : undefined}>
        <Input
          name="password"
          type="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          required
        />
      </Field>
      {state?.error && <Notice tone="red">{state.error}</Notice>}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "One sec…" : mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}
