import Link from "next/link";
import { BookButton } from "@/components/book-button";
import { ClassCard } from "@/components/class-card";
import { DayStrip } from "@/components/day-strip";
import { Chip, EmptyState, Notice } from "@/components/ui";
import { LATE_CANCEL_HOURS } from "@/lib/booking";
import { getClasses, groupByDay, parseDay, weekOf, type ClassListItem } from "@/lib/classes";
import { usableMembershipsQuery } from "@/lib/memberships";
import { db } from "@/db";
import { requireMember } from "@/lib/tenant";
import { addDays, dayKey } from "@/lib/time";
import { book, cancel } from "./actions";

export default async function MemberSchedule({ params, searchParams }: PageProps<"/g/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { gym, member } = await requireMember(slug);
  const now = new Date();
  const today = dayKey(now, gym.timezone);
  const days = weekOf(today);
  const selected = parseDay(sp.day, today);
  const [classes, usable] = await Promise.all([
    getClasses(gym, today, addDays(today, 7), member.id),
    usableMembershipsQuery(db, member.id, now).limit(1),
  ]);
  const byDay = groupByDay(classes, gym.timezone);
  const list = byDay.get(selected) ?? [];
  const counts = new Map([...byDay].map(([d, l]) => [d, l.length]));

  function action(c: ClassListItem) {
    if (c.cancelledAt || c.startsAt <= now) return null;
    const my = c.my;
    if (my?.status === "booked") {
      const late = c.startsAt.getTime() - now.getTime() < LATE_CANCEL_HOURS * 3_600_000;
      return (
        <BookButton
          action={cancel.bind(null, slug, my.bookingId)}
          label="Cancel"
          variant="secondary"
          confirm={late ? "Late, lose credit?" : "Tap to confirm"}
        />
      );
    }
    if (my?.status === "waitlisted") {
      return <BookButton action={cancel.bind(null, slug, my.bookingId)} label="Leave waitlist" variant="ghost" />;
    }
    const full = c.booked >= c.capacity;
    return <BookButton action={book.bind(null, slug, c.id)} label={full ? "Join waitlist" : "Book"} variant={full ? "secondary" : "primary"} />;
  }

  function status(c: ClassListItem) {
    if (c.my?.status === "booked") return <Chip tone="green">Booked</Chip>;
    if (c.my?.status === "attended") return <Chip tone="green">Checked in</Chip>;
    if (c.my?.status === "waitlisted") return <Chip tone="yellow">Waitlist #{c.my.position}</Chip>;
    if (c.my?.status === "late_cancel") return <Chip tone="red">Late cancel</Chip>;
    return null;
  }

  return (
    <>
      {member.status !== "active" ? (
        <div className="mb-4">
          <Notice tone="yellow">Your membership is {member.status}. Talk to the front desk to book.</Notice>
        </div>
      ) : (
        usable.length === 0 && (
          <div className="mb-4">
            <Notice tone="yellow">
              You need a pass to book.{" "}
              <Link href={`/g/${slug}/plans`} className="font-semibold text-blue underline">
                See plans
              </Link>
            </Notice>
          </div>
        )
      )}
      <DayStrip days={days} selected={selected} today={today} counts={counts} hrefFor={(d) => `/g/${slug}?day=${d}`} />
      <div className="mt-4 flex flex-col gap-2">
        {list.length === 0 ? (
          <EmptyState title="No classes">Nothing on the board for this day. Rest up.</EmptyState>
        ) : (
          list.map((c) => <ClassCard key={c.id} cls={c} timeZone={gym.timezone} now={now} action={action(c)} status={status(c)} />)
        )}
      </div>
    </>
  );
}
