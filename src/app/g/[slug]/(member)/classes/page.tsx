import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema } from "@/db";
import { BookButton } from "@/components/book-button";
import { Chip, EmptyState, SectionHeading } from "@/components/ui";
import { LATE_CANCEL_HOURS } from "@/lib/booking";
import { requireMember } from "@/lib/tenant";
import { formatDateTime } from "@/lib/time";
import { cancel } from "../actions";

export const metadata: Metadata = { title: "My classes" };

const tone = { booked: "green", waitlisted: "yellow", attended: "green", no_show: "red", late_cancel: "red", cancelled: "neutral" } as const;
const label = { booked: "Booked", waitlisted: "Waitlist", attended: "Attended", no_show: "No-show", late_cancel: "Late cancel", cancelled: "Cancelled" };

export default async function MyClasses({ params }: PageProps<"/g/[slug]/classes">) {
  const { slug } = await params;
  const { gym, member } = await requireMember(slug);
  const now = new Date();
  const base = db
    .select({ booking: schema.booking, cls: schema.classSession })
    .from(schema.booking)
    .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.classSessionId));
  const [upcoming, past] = await Promise.all([
    base
      .where(
        and(
          eq(schema.booking.memberId, member.id),
          gte(schema.classSession.startsAt, now),
          inArray(schema.booking.status, ["booked", "waitlisted"]),
        ),
      )
      .orderBy(asc(schema.classSession.startsAt)),
    db
      .select({ booking: schema.booking, cls: schema.classSession })
      .from(schema.booking)
      .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.classSessionId))
      .where(and(eq(schema.booking.memberId, member.id), lt(schema.classSession.startsAt, now)))
      .orderBy(desc(schema.classSession.startsAt))
      .limit(30),
  ]);
  const attended = past.filter((p) => p.booking.status === "attended").length;

  return (
    <div className="flex flex-col gap-10">
      <section>
        <SectionHeading>Coming up</SectionHeading>
        {upcoming.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Nothing booked">Pick a class from the schedule.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map(({ booking: b, cls }) => {
              const late = cls.startsAt.getTime() - now.getTime() < LATE_CANCEL_HOURS * 3_600_000;
              return (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{cls.title}</p>
                    <p className="text-sm text-ink-soft">{formatDateTime(cls.startsAt, gym.timezone)}</p>
                    <div className="mt-1">
                      <Chip tone={tone[b.status]}>{label[b.status]}</Chip>
                    </div>
                  </div>
                  <div className="w-36 shrink-0 [&_button]:w-full">
                    <BookButton
                      action={cancel.bind(null, slug, b.id)}
                      label={b.status === "waitlisted" ? "Leave" : "Cancel"}
                      variant="secondary"
                      confirm={b.status === "booked" ? (late ? "Late, lose credit?" : "Tap to confirm") : undefined}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-soft">
          Cancel at least {LATE_CANCEL_HOURS} hours before class to get your credit back.
        </p>
      </section>

      <section>
        <SectionHeading action={<span className="text-sm font-semibold text-ink-soft">{attended} attended</span>}>History</SectionHeading>
        {past.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">Your first class will show up here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {past.map(({ booking: b, cls }) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{cls.title}</p>
                  <p className="text-sm text-ink-soft">{formatDateTime(cls.startsAt, gym.timezone)}</p>
                </div>
                <Chip tone={tone[b.status]}>{label[b.status]}</Chip>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
