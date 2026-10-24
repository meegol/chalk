import Link from "next/link";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between bg-ink p-10 text-paper lg:flex">
        <Link href="/">
          <Logo className="text-2xl" />
        </Link>
        <div className="max-w-md">
          <p className="font-mono text-xs uppercase tracking-widest text-paper/60">Today · 06:00</p>
          <p className="mt-3 font-display text-6xl font-extrabold uppercase leading-[0.9]">
            21-15-9
            <br />
            Thrusters
            <br />
            Pull-ups
          </p>
          <div className="mt-8 flex gap-1" aria-hidden>
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className={i < 13 ? "h-6 w-2.5 bg-paper" : "h-6 w-2.5 border border-paper/40"} />
            ))}
          </div>
          <p className="mt-2 text-sm text-paper/70">13 of 16 booked. 3 spots left.</p>
        </div>
        <p className="text-sm text-paper/50">Class booking, memberships and check-in for strength gyms.</p>
      </aside>
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <Link href="/" className="lg:hidden">
          <Logo className="text-xl" />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
