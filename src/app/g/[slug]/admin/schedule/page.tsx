import type { Metadata } from "next";
import Link from "next/link";
import { ClassCard } from "@/components/class-card";
import { CoachSelect, TimingFields } from "@/components/class-fields";
import { DayStrip } from "@/components/day-strip";
import { ActionForm } from "@/components/form-bits";
import { ButtonLink, Card, cn, EmptyState, Field, Input, PageTitle, SectionHeading } from "@/components/ui";
import { getClasses, getCoaches, groupByDay, parseDay, weekOf } from "@/lib/classes";
import { requireStaff } from "@/lib/tenant";
import { addDays, dayKey, formatDayLabel, formatTime, weekdayOfKey } from "@/lib/time";
import { createOneOff } from "./actions";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage({ params, searchParams }: PageProps<"/g/[slug]/admin/schedule">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { gym } = await requireStaff(slug);
  const now = new Date();
  const today = dayKey(now, gym.timezone);
  const selected = parseDay(sp.day, today);
  // Weeks start on Monday, the way gyms program.
  const weekStart = addDays(selected, -((weekdayOfKey(selected) + 6) % 7));
  const days = weekOf(weekStart);
  const [classes, coaches] = await Promise.all([getClasses(gym, weekStart, addDays(weekStart, 7)), getCoaches(gym.id)]);
  const byDay = groupByDay(classes, gym.timezone);
  const counts = new Map([...byDay].map(([d, list]) => [d, list.length]));
  const base = `/g/${slug}/admin/schedule`;
  const dayClasses = byDay.get(selected) ?? [];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <PageTitle sub={`${formatDayLabel(weekStart, { month: "long", day: "numeric" })} – ${formatDayLabel(addDays(weekStart, 6), { month: "long", day: "numeric" })}`}>
          Schedule
        </PageTitle>
        <div className="mb-6 flex flex-wrap gap-2">
          <ButtonLink size="sm" variant="ghost" href={`${base}?day=${addDays(weekStart, -7)}`} aria-label="Previous week">
            ←
          </ButtonLink>
          <ButtonLink size="sm" variant="secondary" href={base}>
            This week
          </ButtonLink>
          <ButtonLink size="sm" variant="ghost" href={`${base}?day=${addDays(weekStart, 7)}`} aria-label="Next week">
            →
          </ButtonLink>
          <ButtonLink size="sm" href={`${base}/templates`}>
            Weekly classes
          </ButtonLink>
        </div>
      </div>

      {/* Phones and tablets: day strip + list */}
      <div className="xl:hidden">
        <DayStrip days={days} selected={selected} today={today} counts={counts} hrefFor={(d) => `${base}?day=${d}`} />
        <div className="mt-4 flex flex-col gap-2">
          {dayClasses.length === 0 ? (
            <EmptyState title="Rest day">
              No classes on {formatDayLabel(selected)}. <Link href={`${base}/templates`} className="text-blue underline">Set up weekly classes</Link> or add one below.
            </EmptyState>
          ) : (
            dayClasses.map((c) => <ClassCard key={c.id} cls={c} timeZone={gym.timezone} href={`${base}/${c.id}`} />)
          )}
        </div>
      </div>

      {/* Wide screens: week grid */}
      <div className="hidden grid-cols-7 gap-2 xl:grid">
        {days.map((d) => (
          <div key={d} className="min-w-0">
            <div className={cn("mb-2 border-b-4 pb-1", d === today ? "border-red" : "border-ink")}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{formatDayLabel(d, { weekday: "short" })}</p>
              <p className="font-display text-2xl font-extrabold leading-none">{formatDayLabel(d, { day: "numeric" })}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {(byDay.get(d) ?? []).map((c) => (
                <Link
                  key={c.id}
                  href={`${base}/${c.id}`}
                  className={cn(
                    "rounded-sm border border-line bg-surface p-2 hover:border-ink",
                    c.cancelledAt && "line-through opacity-50",
                    !c.cancelledAt && c.startsAt.getTime() + c.durationMin * 60_000 < now.getTime() && "opacity-50",
                  )}
                >
                  <p className="font-display text-lg font-bold leading-none">{formatTime(c.startsAt, gym.timezone)}</p>
                  <p className="truncate text-sm font-semibold">{c.title}</p>
                  <p className={cn("text-xs", c.booked >= c.capacity ? "text-red" : "text-ink-soft")}>
                    {c.booked}/{c.capacity}
                    {c.waitlisted ? ` +${c.waitlisted}` : ""}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-10 max-w-xl">
        <SectionHeading>One-off class</SectionHeading>
        <Card className="mt-4 p-4">
          <ActionForm action={createOneOff.bind(null, slug)} submit="Add class">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title">
                <Input name="title" required placeholder="Saturday partner WOD" />
              </Field>
              <Field label="Date">
                <Input name="day" type="date" required defaultValue={selected} min={today} />
              </Field>
            </div>
            <TimingFields />
            <CoachSelect coaches={coaches} />
          </ActionForm>
        </Card>
      </section>
    </>
  );
}
