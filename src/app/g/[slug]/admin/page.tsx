import { and, count, eq, gte, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { ClassCard } from "@/components/class-card";
import { ButtonLink, Card, cn, EmptyState, PageTitle, SectionHeading } from "@/components/ui";
import { getClasses } from "@/lib/classes";
import { FREE_MEMBER_LIMIT } from "@/lib/members";
import { requireStaff } from "@/lib/tenant";
import { addDays, dayKey, formatDayLabel, zonedToUtc } from "@/lib/time";
import { formatMoney } from "@/lib/utils";

function Stat({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "red" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className={cn("mt-1 font-display text-5xl font-extrabold leading-none", tone === "red" && "text-red")}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-soft">{sub}</p>}
    </Card>
  );
}

export default async function AdminHome({ params }: PageProps<"/g/[slug]/admin">) {
  const { slug } = await params;
  const { gym, staff } = await requireStaff(slug);
  const now = new Date();
  const today = dayKey(now, gym.timezone);
  const startOfDay = zonedToUtc(today, "00:00", gym.timezone);
  const startOfMonth = zonedToUtc(`${today.slice(0, 8)}01`, "00:00", gym.timezone);

  const [classes, [checkins], [members], [revenue], [templates], [pastDue]] = await Promise.all([
    getClasses(gym, today, addDays(today, 1)),
    db.select({ n: count() }).from(schema.checkin).where(and(eq(schema.checkin.gymId, gym.id), gte(schema.checkin.createdAt, startOfDay))),
    db.select({ n: count() }).from(schema.member).where(and(eq(schema.member.gymId, gym.id), ne(schema.member.status, "cancelled"))),
    db
      .select({ cents: sql<number>`coalesce(sum(${schema.plan.priceCents}), 0)::int` })
      .from(schema.membership)
      .innerJoin(schema.plan, eq(schema.plan.id, schema.membership.planId))
      .where(and(eq(schema.membership.gymId, gym.id), gte(schema.membership.createdAt, startOfMonth))),
    db.select({ n: count() }).from(schema.classTemplate).where(and(eq(schema.classTemplate.gymId, gym.id), eq(schema.classTemplate.active, true))),
    db.select({ n: count() }).from(schema.membership).where(and(eq(schema.membership.gymId, gym.id), eq(schema.membership.status, "past_due"))),
  ]);
  const booked = classes.filter((c) => !c.cancelledAt).reduce((s, c) => s + c.booked, 0);
  const seats = classes.filter((c) => !c.cancelledAt).reduce((s, c) => s + c.capacity, 0);
  const next = classes.find((c) => !c.cancelledAt && c.startsAt.getTime() + c.durationMin * 60_000 > now.getTime());
  const isOwner = staff.role === "owner";

  const steps = [
    { done: templates.n > 0, label: "Add your weekly classes", href: `/g/${slug}/admin/schedule/templates` },
    { done: true, label: "Check your membership plans", href: `/g/${slug}/admin/plans` },
    { done: members.n > 1, label: "Share your signup link with members", href: `/g/${slug}/admin/settings` },
    { done: gym.chargesEnabled, label: "Turn on card payments", href: `/g/${slug}/admin/settings/billing` },
  ];
  const showSetup = isOwner && steps.some((s) => !s.done);

  return (
    <>
      <PageTitle sub={formatDayLabel(today, { weekday: "long", month: "long", day: "numeric" })}>Today</PageTitle>

      {showSetup && (
        <Card className="mb-8 border-2 border-ink p-5">
          <p className="font-display text-2xl font-extrabold uppercase">Get your box ready</p>
          <ol className="mt-3 flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border-2 text-xs font-bold",
                    s.done ? "border-green bg-green text-paper" : "border-ink",
                  )}
                  aria-label={s.done ? "Done" : "To do"}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <Link href={s.href} className={cn("font-semibold", s.done ? "text-ink-soft line-through" : "hover:underline")}>
                  {s.label}
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Booked today" value={booked} sub={seats ? `of ${seats} spots` : "No classes today"} />
        <Stat label="Checked in" value={checkins.n} sub="since midnight" />
        <Stat
          label="Members"
          value={members.n}
          sub={gym.saasPlan === "free" ? `of ${FREE_MEMBER_LIMIT} on Free` : "Pro plan"}
          tone={gym.saasPlan === "free" && members.n >= FREE_MEMBER_LIMIT - 3 ? "red" : undefined}
        />
        <Stat
          label="Sold this month"
          value={formatMoney(revenue.cents)}
          sub={pastDue.n ? `${pastDue.n} payment${pastDue.n === 1 ? "" : "s"} failed` : "cash + card"}
          tone={pastDue.n ? "red" : undefined}
        />
      </div>

      <section className="mt-10">
        <SectionHeading action={<ButtonLink href={`/g/${slug}/admin/check-in`} size="sm">Open check-in</ButtonLink>}>
          {next ? "Up next" : "Classes"}
        </SectionHeading>
        <div className="mt-4 flex flex-col gap-2">
          {classes.length === 0 ? (
            <EmptyState title="No classes today">
              <Link href={`/g/${slug}/admin/schedule/templates`} className="text-blue underline">
                Set up your weekly timetable
              </Link>
            </EmptyState>
          ) : (
            classes.map((c) => <ClassCard key={c.id} cls={c} timeZone={gym.timezone} now={now} href={`/g/${slug}/admin/schedule/${c.id}`} />)
          )}
        </div>
      </section>
    </>
  );
}
