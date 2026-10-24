import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { safeNext } from "@/lib/utils";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next, email } = await searchParams;
  const target = safeNext(next);
  return (
    <>
      <h1 className="font-display text-5xl font-extrabold uppercase leading-none">Create account</h1>
      <p className="mb-8 mt-2 text-ink-soft">One login for every gym you train at or run.</p>
      <AuthForm action={signUp} mode="sign-up" next={target} email={typeof email === "string" ? email : undefined} />
      <p className="mt-6 text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href={`/sign-in?next=${encodeURIComponent(target)}`} className="font-semibold text-blue underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
