import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "./ui";

export function TopBar({ userName }: { userName?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/home">
          <Logo className="text-xl" />
        </Link>
        {userName && (
          <form action={signOut} className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-soft sm:inline">{userName}</span>
            <button className="text-xs font-semibold uppercase tracking-wider text-ink-soft hover:text-ink">
              Sign out
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
