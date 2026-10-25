import { and, count, desc, eq, ilike, ne, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db, schema } from "@/db";
import { ActionForm } from "@/components/form-bits";
import { Card, Chip, EmptyState, Field, Input, PageTitle, SectionHeading } from "@/components/ui";
import { FREE_MEMBER_LIMIT } from "@/lib/members";
import { requireStaff } from "@/lib/tenant";
import { addMember } from "./actions";

export const metadata: Metadata = { title: "Members" };

const statusTone = { active: "green", paused: "yellow", cancelled: "neutral" } as const;

export default async function MembersPage({ params, searchParams }: PageProps<"/g/[slug]/admin/members">) {
  const { slug } = await params;
  const { q } = await searchParams;
  const { gym } = await requireStaff(slug);
  const query = typeof q === "string" ? q.trim() : "";

  const where = and(
    eq(schema.member.gymId, gym.id),
    query ? or(ilike(schema.member.name, `%${query}%`), ilike(schema.member.email, `%${query}%`)) : undefined,
  );
  const [members, [{ n: active }]] = await Promise.all([
    db.select().from(schema.member).where(where).orderBy(desc(schema.member.createdAt)).limit(200),
    db
      .select({ n: count() })
      .from(schema.member)
      .where(and(eq(schema.member.gymId, gym.id), ne(schema.member.status, "cancelled"))),
  ]);
  const atCap = gym.saasPlan === "free" && active >= FREE_MEMBER_LIMIT;

  return (
    <>
      <PageTitle
        sub={
          gym.saasPlan === "free" ? `${active} of ${FREE_MEMBER_LIMIT} members on the Free plan` : `${active} active members`
        }
      >
        Members
      </PageTitle>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <form className="mb-4 flex gap-2">
            <Input name="q" defaultValue={query} placeholder="Search name or email" type="search" />
          </form>
          {members.length === 0 ? (
            <EmptyState title={query ? "No matches" : "No members yet"}>
              {query ? "Try a different name." : `Share /g/${gym.slug}/join or add someone on the right.`}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {members.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/g/${slug}/admin/members/${m.id}`}
                    className="flex items-center justify-between gap-3 px-1 py-3 hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{m.name}</p>
                      <p className="truncate text-sm text-ink-soft">{m.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!m.userId && <span className="hidden text-xs text-ink-soft sm:inline">No login</span>}
                      <Chip tone={statusTone[m.status]}>{m.status}</Chip>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          <SectionHeading>Add member</SectionHeading>
          <Card className="mt-4 p-4">
            {atCap ? (
              <p className="text-sm">
                You&apos;ve hit the Free plan&apos;s {FREE_MEMBER_LIMIT} members.{" "}
                <Link href={`/g/${slug}/admin/settings`} className="font-semibold text-blue underline">
                  Upgrade to Pro
                </Link>{" "}
                for unlimited members.
              </p>
            ) : (
              <ActionForm action={addMember.bind(null, slug)} submit="Add member">
                <Field label="Name">
                  <Input name="name" required />
                </Field>
                <Field label="Email" hint="When they sign up with this email, their account links up.">
                  <Input name="email" type="email" required />
                </Field>
              </ActionForm>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
