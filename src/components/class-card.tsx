import Link from "next/link";
import type { ReactNode } from "react";
import type { ClassListItem } from "@/lib/classes";
import { formatTime } from "@/lib/time";
import { Chip, cn, SpotsMeter } from "./ui";

/** The core component: time in display type, title + coach, seats, one action. */
export function ClassCard({
  cls,
  timeZone,
  action,
  status,
  href,
  now = new Date(),
}: {
  cls: ClassListItem;
  timeZone: string;
  action?: ReactNode;
  status?: ReactNode;
  href?: string;
  now?: Date;
}) {
  const [time, meridiem] = formatTime(cls.startsAt, timeZone).split(" ");
  const ended = cls.startsAt.getTime() + cls.durationMin * 60_000 < now.getTime();
  const live = !ended && cls.startsAt <= now;
  const body = (
    <div className="flex min-w-0 flex-1 items-stretch gap-4">
      <div className="flex w-16 shrink-0 flex-col justify-center border-r-2 border-ink pr-3 text-right">
        <span className="font-display text-3xl font-extrabold leading-none">{time}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{meridiem}</span>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("truncate text-lg font-bold leading-tight", cls.cancelledAt && "line-through")}>{cls.title}</p>
          {live && <Chip tone="red">Live</Chip>}
          {cls.cancelledAt && <Chip tone="red">Cancelled</Chip>}
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-soft">
          {cls.durationMin} min{cls.coachName ? ` · ${cls.coachName}` : ""}
          {cls.waitlisted > 0 ? ` · ${cls.waitlisted} waiting` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!cls.cancelledAt && <SpotsMeter taken={cls.booked} capacity={cls.capacity} />}
          {status}
        </div>
      </div>
    </div>
  );
  return (
    <div className={cn("flex flex-col gap-3 rounded-sm border border-line bg-surface p-3 sm:flex-row sm:items-center", (ended || cls.cancelledAt) && "opacity-60")}>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 hover:opacity-80">
          {body}
        </Link>
      ) : (
        body
      )}
      {action && <div className="shrink-0 sm:w-36 [&>*]:w-full [&_button]:w-full">{action}</div>}
    </div>
  );
}
