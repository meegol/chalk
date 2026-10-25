"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn, Logo } from "./ui";

type Item = { href: string; label: string; icon: keyof typeof icons; ownerOnly?: boolean };

const icons = {
  today: "M4 5h16v15H4zM4 9h16M9 3v4M15 3v4",
  schedule: "M4 6h16M4 12h16M4 18h10",
  checkin: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2",
  members: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11a3 3 0 1 0 0-6M18 14c2.4.6 4 2.9 4 6",
  plans: "M3 7h18v12H3zM3 11h18M7 15h4",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  member: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7",
};

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="square" aria-hidden>
      <path d={icons[name]} />
    </svg>
  );
}

export function AdminNav({ slug, gymName, isOwner }: { slug: string; gymName: string; isOwner: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const base = `/g/${slug}/admin`;
  const items: Item[] = [
    { href: base, label: "Today", icon: "today" },
    { href: `${base}/schedule`, label: "Schedule", icon: "schedule" },
    { href: `${base}/check-in`, label: "Check-in", icon: "checkin" },
    { href: `${base}/members`, label: "Members", icon: "members" },
    { href: `${base}/plans`, label: "Plans", icon: "plans" },
    { href: `${base}/settings`, label: "Settings", icon: "settings", ownerOnly: true },
  ];
  const visible = items.filter((i) => !i.ownerOnly || isOwner);
  const isActive = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));
  const primary = visible.slice(0, 4);
  const overflow = visible.slice(4);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r-2 border-ink bg-surface lg:flex">
        <div className="border-b border-line px-5 py-5">
          <Link href="/home" className="text-ink-soft">
            <Logo className="text-base" />
          </Link>
          <p className="mt-3 font-display text-2xl font-extrabold uppercase leading-none">{gymName}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {visible.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "flex h-11 items-center gap-3 rounded-sm px-3 text-sm font-semibold uppercase tracking-wide",
                isActive(i.href) ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper hover:text-ink",
              )}
            >
              <Icon name={i.icon} />
              {i.label}
            </Link>
          ))}
        </nav>
        <Link
          href={`/g/${slug}`}
          className="m-3 flex h-11 items-center gap-3 rounded-sm border border-line px-3 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          <Icon name="member" />
          Member view
        </Link>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur lg:hidden">
        <p className="truncate font-display text-xl font-extrabold uppercase">{gymName}</p>
        <Link href="/home" className="text-ink-soft">
          <Logo className="text-sm" />
        </Link>
      </header>

      {/* Mobile tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-surface lg:hidden">
        <div className="grid grid-cols-5">
          {primary.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide",
                isActive(i.href) ? "text-ink" : "text-ink-soft",
              )}
            >
              <span className={cn("h-1 w-6", isActive(i.href) ? "bg-red" : "bg-transparent")} />
              <Icon name={i.icon} />
              {i.label}
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide",
              overflow.some((i) => isActive(i.href)) ? "text-ink" : "text-ink-soft",
            )}
            aria-haspopup="dialog"
          >
            <span className="h-1 w-6" />
            <Icon name="more" />
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal aria-label="More">
          <button className="absolute inset-0 bg-ink/40" onClick={() => setMoreOpen(false)} aria-label="Close" />
          <div className="pb-safe absolute inset-x-0 bottom-0 border-t-2 border-ink bg-surface">
            <div className="flex flex-col p-3">
              {[...overflow, { href: `/g/${slug}`, label: "Member view", icon: "member" as const }].map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex h-14 items-center gap-3 border-b border-line px-2 text-sm font-semibold uppercase tracking-wide last:border-0"
                >
                  <Icon name={i.icon} />
                  {i.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
