import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { safeNext } from "@/lib/utils";
import { signIn } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  const target = safeNext(next);
  return (
    <>
      <h1 className="font-display text-5xl font-extrabold uppercase leading-none">Sign in</h1>
      <p className="mb-8 mt-2 text-ink-soft">Welcome back. Your next class is waiting.</p>
      {process.env.DEMO_MODE === "1" && (
        <div className="mb-6 rounded-sm border-2 border-dashed border-ink p-4 text-sm">
          <p className="font-semibold">Demo accounts</p>
          <p className="mt-1 text-ink-soft">
            <span className="font-mono text-ink">owner@chalk.dev</span>, <span className="font-mono text-ink">coach@chalk.dev</span>{" "}
            or <span className="font-mono text-ink">member@chalk.dev</span>, password{" "}
            <span className="font-mono text-ink">chalkdemo</span>. Data resets daily.
          </p>
        </div>
      )}
      <AuthForm action={signIn} mode="sign-in" next={target} />
      <p className="mt-6 text-sm text-ink-soft">
        New here?{" "}
        <Link href={`/sign-up?next=${encodeURIComponent(target)}`} className="font-semibold text-blue underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
