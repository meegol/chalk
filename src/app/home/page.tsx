import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db, schema } from "@/db";
import { TopBar } from "@/components/top-bar";
import { ButtonLink, Chip, EmptyState, PageTitle, SectionHeading } from "@/components/ui";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Your gyms" };

export default async function HomePage() {
  const user = await requireUser("/home");
  const [staffOf, memberOf] = await Promise.all([
    db
      .select({ slug: schema.gym.slug, name: schema.gym.name, role: schema.staff.role })
      .from(schema.staff)
      .innerJoin(schema.gym, eq(schema.gym.id, schema.staff.gymId))
      .where(eq(schema.staff.userId, user.id)),
    db
      .select({ slug: schema.gym.slug, name: schema.gym.name })
      .from(schema.member)
      .innerJoin(schema.gym, eq(schema.gym.id, schema.member.gymId))
      .where(eq(schema.member.userId, user.id)),
  ]);

  return (
    <>
      <TopBar userName={user.name} />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <PageTitle sub={`Signed in as ${user.email}`}>Hey, {user.name.split(" ")[0]}</PageTitle>

        <section className="mb-10">
          <SectionHeading action={<ButtonLink href="/new" size="sm" variant="secondary">New gym</ButtonLink>}>
            Gyms you run
          </SectionHeading>
          {staffOf.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No gyms yet">Own or coach at a box? Set it up in two minutes.</EmptyState>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {staffOf.map((g) => (
                <li key={g.slug}>
                  <Link href={`/g/${g.slug}/admin`} className="flex items-center justify-between gap-3 py-4 hover:bg-surface">
                    <span className="font-display text-2xl font-bold uppercase">{g.name}</span>
                    <Chip tone={g.role === "owner" ? "blue" : "neutral"}>{g.role}</Chip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeading>Where you train</SectionHeading>
          {memberOf.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              Got a link from your gym? Open it to join and book your first class.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {memberOf.map((g) => (
                <li key={g.slug}>
                  <Link href={`/g/${g.slug}`} className="flex items-center justify-between py-4 hover:bg-surface">
                    <span className="font-display text-2xl font-bold uppercase">{g.name}</span>
                    <span className="text-sm font-semibold text-blue">Book classes →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
