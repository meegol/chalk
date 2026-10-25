import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { ActionForm } from "@/components/form-bits";
import { Button, Card, Chip, EmptyState, Field, SectionHeading, Select } from "@/components/ui";
import { describeMembership, getMemberMemberships } from "@/lib/memberships";
import { requireStaff } from "@/lib/tenant";
import { formatDateTime } from "@/lib/time";
import { formatMoney } from "@/lib/utils";
import { cancelMembership, recordCashPayment, setMemberStatus } from "../actions";

const bookingTone = {
  booked: "blue",
  waitlisted: "yellow",
  attended: "green",
  no_show: "red",
  late_cancel: "red",
  cancelled: "neutral",
} as const;

export default async function MemberPage({ params }: PageProps<"/g/[slug]/admin/members/[memberId]">) {
  const { slug, memberId } = await params;
  const { gym } = await requireStaff(slug);
  const member = await db.query.member.findFirst({
    where: and(eq(schema.member.id, memberId), eq(schema.member.gymId, gym.id)),
  });
  if (!member) notFound();

  const [memberships, plans, bookings] = await Promise.all([
    getMemberMemberships(member.id),
    db.query.plan.findMany({ where: and(eq(schema.plan.gymId, gym.id), eq(schema.plan.active, true)) }),
    db
      .select({ booking: schema.booking, cls: schema.classSession })
      .from(schema.booking)
      .innerJoin(schema.classSession, eq(schema.classSession.id, schema.booking.classSessionId))
      .where(eq(schema.booking.memberId, member.id))
      .orderBy(desc(schema.classSession.startsAt))
      .limit(20),
  ]);

  return (
    <>
      <Link href={`/g/${slug}/admin/members`} className="text-sm font-semibold text-ink-soft hover:text-ink">
        ← Members
      </Link>
      <div className="mb-8 mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-4xl font-extrabold uppercase leading-none sm:text-5xl">{member.name}</h1>
          <p className="mt-2 break-all text-ink-soft">{member.email}</p>
          <p className="mt-1 font-mono text-xs text-ink-soft">Check-in code {member.checkinCode}</p>
        </div>
        <form action={setMemberStatus.bind(null, slug, member.id)} className="flex gap-2">
          <Select name="status" defaultValue={member.status} className="h-10 w-36">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Button size="sm" variant="secondary" className="h-10">
            Save
          </Button>
        </form>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-8">
          <section>
            <SectionHeading>Memberships</SectionHeading>
            {memberships.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="No membership">They can buy one in the app, or record a cash payment.</EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {memberships.map(({ membership: m, plan }) => {
                  const d = describeMembership(m, plan);
                  return (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-semibold">{plan.name}</p>
                        <p className="text-sm text-ink-soft">
                          {m.paidVia === "cash" ? "Cash" : "Card"} · {formatDateTime(m.createdAt, gym.timezone)}
                          {m.expiresAt && ` · ends ${formatDateTime(m.expiresAt, gym.timezone)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Chip tone={d.usable ? "green" : m.status === "past_due" ? "red" : "neutral"}>{d.label}</Chip>
                        {m.status === "active" && (
                          <form action={cancelMembership.bind(null, slug, member.id, m.id)}>
                            <Button size="sm" variant="ghost">
                              Cancel
                            </Button>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <SectionHeading>Recent classes</SectionHeading>
            {bookings.length === 0 ? (
              <p className="mt-4 text-sm text-ink-soft">No bookings yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {bookings.map(({ booking: b, cls }) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{cls.title}</p>
                      <p className="text-sm text-ink-soft">{formatDateTime(cls.startsAt, gym.timezone)}</p>
                    </div>
                    <Chip tone={bookingTone[b.status]}>{b.status.replace("_", " ")}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside>
          <SectionHeading>Cash payment</SectionHeading>
          <Card className="mt-4 p-4">
            <ActionForm action={recordCashPayment.bind(null, slug, member.id)} submit="Record payment">
              <Field label="Plan" hint="Use this when someone pays at the desk.">
                <Select name="planId" required defaultValue="">
                  <option value="" disabled>
                    Choose a plan
                  </option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatMoney(p.priceCents)}
                    </option>
                  ))}
                </Select>
              </Field>
            </ActionForm>
          </Card>
        </aside>
      </div>
    </>
  );
}
