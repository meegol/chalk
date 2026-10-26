import Link from "next/link";
import { formatDayLabel } from "@/lib/time";
import { cn } from "./ui";

/** Seven-day picker. Snap-scrolls on phones; every day is a 48px+ target. */
export function DayStrip({
  days,
  selected,
  today,
  hrefFor,
  counts,
}: {
  days: string[];
  selected: string;
  today: string;
  hrefFor: (day: string) => string;
  counts?: Map<string, number>;
}) {
  return (
    <nav className="no-scrollbar -mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Pick a day">
      {days.map((d) => {
        const active = d === selected;
        return (
          <Link
            key={d}
            href={hrefFor(d)}
            scroll={false}
            aria-current={active ? "date" : undefined}
            className={cn(
              "flex min-w-[3.75rem] flex-1 snap-start flex-col items-center rounded-sm border-2 py-2",
              active ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink hover:border-ink",
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
              {d === today ? "Today" : formatDayLabel(d, { weekday: "short" })}
            </span>
            <span className="font-display text-2xl font-extrabold leading-none">{formatDayLabel(d, { day: "numeric" })}</span>
            {counts && (
              <span className={cn("mt-1 h-1 w-4", (counts.get(d) ?? 0) > 0 ? (active ? "bg-paper" : "bg-ink") : "bg-transparent")} />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
