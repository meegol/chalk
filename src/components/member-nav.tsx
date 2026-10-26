"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

const tabs = [
  { path: "", label: "Schedule", d: "M4 5h16v15H4zM4 9h16M9 3v4M15 3v4" },
  { path: "/classes", label: "My classes", d: "M5 12l4 4L19 6" },
  { path: "/pass", label: "Pass", d: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z" },
  { path: "/plans", label: "Plans", d: "M3 7h18v12H3zM3 11h18M7 15h4" },
];

export function MemberNav({ slug, placement }: { slug: string; placement: "top" | "bottom" }) {
  const pathname = usePathname();
  const base = `/g/${slug}`;
  const active = (p: string) => (p === "" ? pathname === base : pathname.startsWith(base + p));
  if (placement === "top") {
    return (
      <nav className="mx-auto hidden max-w-2xl gap-1 px-4 sm:flex" aria-label="Member">
        {tabs.map((t) => (
          <Link
            key={t.path}
            href={base + t.path}
            className={cn(
              "border-b-4 px-3 py-3 text-sm font-semibold uppercase tracking-wide",
              active(t.path) ? "border-red text-ink" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-surface sm:hidden" aria-label="Member">
        <div className="grid grid-cols-4">
          {tabs.map((t) => (
            <Link
              key={t.path}
              href={base + t.path}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide",
                active(t.path) ? "text-ink" : "text-ink-soft",
              )}
            >
              <span className={cn("h-1 w-6", active(t.path) ? "bg-red" : "bg-transparent")} />
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="square" aria-hidden>
                <path d={t.d} />
              </svg>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
  );
}
