import Link from "next/link";
import { ButtonLink, Chip, Logo, SpotsMeter } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

const board = [
  { time: "6:00", m: "AM", title: "WOD", coach: "Riley", taken: 16, cap: 16, chip: <Chip tone="yellow">Waitlist #2</Chip> },
  { time: "7:00", m: "AM", title: "WOD", coach: "Dev", taken: 11, cap: 16, chip: <Chip tone="green">Booked</Chip> },
  { time: "12:00", m: "PM", title: "Lunch WOD", coach: "Sam", taken: 5, cap: 12, chip: null },
];

const features = [
  {
    n: "01",
    title: "Booking that never oversells",
    body: "Each class locks while a seat is taken, so twenty people tapping Book at 5:59 still fit sixteen spots. The rest join the waitlist and move up on their own when someone cancels.",
  },
  {
    n: "02",
    title: "Passes members actually buy",
    body: "Monthly unlimited, class packs and drop-ins. Members pay in the app through Stripe and the money goes straight to the gym. Cash at the desk works too.",
  },
  {
    n: "03",
    title: "Check-in at the door",
    body: "Every member has a QR pass on their phone. The front desk scans it, sees green or yellow, and the roster marks itself.",
  },
  {
    n: "04",
    title: "Rules gyms already run on",
    body: "Late cancels inside two hours keep the credit. No-shows get logged overnight. Packs expire on schedule. Nobody has to chase it in a spreadsheet.",
  },
];

export default async function Landing() {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo className="text-2xl" />
          <nav className="flex items-center gap-2">
            {user ? (
              <ButtonLink href="/home" size="sm">
                Your gyms
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/sign-in" size="sm" variant="ghost">
                  Sign in
                </ButtonLink>
                <ButtonLink href="/sign-up?next=/new" size="sm">
                  Start free
                </ButtonLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-14 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:py-24">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">For strength & CrossFit-style gyms</p>
            <h1 className="mt-4 font-display text-6xl font-extrabold uppercase leading-[0.88] sm:text-7xl lg:text-8xl">
              Run the box.
              <br />
              <span className="text-red">Not the spreadsheet.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-ink-soft">
              Chalk handles class booking, waitlists, memberships and front-desk check-in, so coaches can get back to coaching.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/sign-up?next=/new">Open your box, free</ButtonLink>
              <ButtonLink href="/sign-in?next=/g/ironside" variant="secondary">
                Try the demo gym
              </ButtonLink>
            </div>
          </div>

          {/* The product, not a stock photo: today's whiteboard. */}
          <div className="rounded-sm border-4 border-ink bg-surface p-4 sm:p-6">
            <div className="flex items-end justify-between border-b-4 border-ink pb-2">
              <p className="font-display text-3xl font-extrabold uppercase leading-none">Ironside · Today</p>
              <p className="font-mono text-xs text-ink-soft">3 classes</p>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {board.map((c) => (
                <li key={c.time} className="flex items-center gap-4 rounded-sm border border-line bg-paper p-3">
                  <div className="w-[4.5rem] shrink-0 border-r-2 border-ink pr-3 text-right">
                    <p className="font-display text-3xl font-extrabold leading-none">{c.time}</p>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{c.m}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{c.title}</p>
                    <p className="text-sm text-ink-soft">60 min · {c.coach}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <SpotsMeter taken={c.taken} capacity={c.cap} />
                      {c.chip}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-y-4 border-ink bg-ink text-paper">
          <div className="mx-auto grid max-w-6xl gap-px px-4 py-14 sm:grid-cols-2">
            {features.map((f) => (
              <div key={f.n} className="py-6 sm:pr-10">
                <p className="font-mono text-sm text-paper/50">{f.n}</p>
                <h2 className="mt-2 font-display text-4xl font-extrabold uppercase leading-none">{f.title}</h2>
                <p className="mt-3 max-w-md text-paper/75">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-5xl font-extrabold uppercase leading-none">Pricing</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-sm border-2 border-line bg-surface p-6">
              <p className="font-display text-3xl font-extrabold uppercase">Free</p>
              <p className="mt-2 font-display text-6xl font-bold">$0</p>
              <p className="mt-3 text-ink-soft">Up to 30 active members. Every feature, including card payments.</p>
            </div>
            <div className="rounded-sm border-4 border-ink bg-surface p-6">
              <div className="flex items-center justify-between">
                <p className="font-display text-3xl font-extrabold uppercase">Pro</p>
                <Chip tone="blue">Growing boxes</Chip>
              </div>
              <p className="mt-2 font-display text-6xl font-bold">
                $49<span className="text-xl text-ink-soft">/mo</span>
              </p>
              <p className="mt-3 text-ink-soft">Unlimited members. Cancel any time from the billing page.</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-soft">Member payments carry a 2% platform fee on top of Stripe&apos;s processing fee.</p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="rounded-sm border-2 border-dashed border-ink p-6">
            <p className="font-display text-3xl font-extrabold uppercase">Look around the demo</p>
            <p className="mt-2 text-ink-soft">
              Password <span className="font-mono text-ink">chalkdemo</span> for every account. Payments run in Stripe test mode.
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["Owner", "owner@chalk.dev", "/g/ironside/admin"],
                ["Coach", "coach@chalk.dev", "/g/ironside/admin/check-in"],
                ["Member", "member@chalk.dev", "/g/ironside"],
              ].map(([role, email, next]) => (
                <Link
                  key={role}
                  href={`/sign-in?next=${encodeURIComponent(next)}`}
                  className="rounded-sm border border-line bg-surface p-3 hover:border-ink"
                >
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{role}</dt>
                  <dd className="mt-1 break-all font-mono text-sm">{email}</dd>
                </Link>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-ink-soft sm:flex-row sm:justify-between">
          <Logo className="text-base text-ink" />
          <p>Built with Next.js, Postgres and Stripe.</p>
        </div>
      </footer>
    </div>
  );
}
