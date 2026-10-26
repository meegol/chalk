import Link from "next/link";
import { MemberNav } from "@/components/member-nav";
import { Logo } from "@/components/ui";
import { requireMember } from "@/lib/tenant";

export default async function MemberLayout({ children, params }: LayoutProps<"/g/[slug]">) {
  const { slug } = await params;
  const { gym, staff } = await requireMember(slug);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <p className="truncate font-display text-2xl font-extrabold uppercase">{gym.name}</p>
          <div className="flex shrink-0 items-center gap-3">
            {staff && (
              <Link href={`/g/${slug}/admin`} className="text-xs font-semibold uppercase tracking-wider text-blue">
                Staff
              </Link>
            )}
            <Link href="/home" className="text-ink-soft" aria-label="All gyms">
              <Logo className="text-sm" />
            </Link>
          </div>
        </div>
        <MemberNav slug={slug} placement="top" />
      </header>
      {/* Outside the header: its backdrop-filter would trap position: fixed. */}
      <MemberNav slug={slug} placement="bottom" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-6 sm:pb-12">{children}</main>
    </div>
  );
}
