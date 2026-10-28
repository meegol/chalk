import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema } from "@/db";
import { Chip, PageTitle, SectionHeading } from "@/components/ui";
import { requireStaff } from "@/lib/tenant";
import { dayKey, formatTime, zonedToUtc } from "@/lib/time";
import { checkInMember } from "./actions";
import { CheckInDesk } from "./check-in-desk";

export const metadata: Metadata = { title: "Check-in" };

export default async function CheckInPage({ params }: PageProps<"/g/[slug]/admin/check-in">) {
  const { slug } = await params;
  const { gym } = await requireStaff(slug);
  const startOfDay = zonedToUtc(dayKey(new Date(), gym.timezone), "00:00", gym.timezone);
  const [members, today] = await Promise.all([
    db.query.member.findMany({
      where: and(eq(schema.member.gymId, gym.id), ne(schema.member.status, "cancelled")),
      columns: { id: true, name: true, email: true },
      orderBy: asc(schema.member.name),
    }),
    db
      .select({ checkin: schema.checkin, name: schema.member.name, classTitle: schema.classSession.title })
      .from(schema.checkin)
      .innerJoin(schema.member, eq(schema.member.id, schema.checkin.memberId))
      .leftJoin(schema.booking, eq(schema.booking.id, schema.checkin.bookingId))
      .leftJoin(schema.classSession, eq(schema.classSession.id, schema.booking.classSessionId))
      .where(and(eq(schema.checkin.gymId, gym.id), gte(schema.checkin.createdAt, startOfDay)))
      .orderBy(desc(schema.checkin.createdAt))
      .limit(50),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle sub="Scan a pass, or search by name.">Check-in</PageTitle>
      <CheckInDesk members={members} action={checkInMember.bind(null, slug)} />
      <section className="mt-10">
        <SectionHeading action={<span className="text-sm font-semibold text-ink-soft">{today.length} today</span>}>Through the door</SectionHeading>
        <ul className="divide-y divide-line">
          {today.map(({ checkin: c, name, classTitle }) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{name}</p>
                <p className="text-sm text-ink-soft">
                  {formatTime(c.createdAt, gym.timezone)} · {classTitle ?? "Open gym"}
                </p>
              </div>
              {!c.hadEntitlement && <Chip tone="yellow">No pass</Chip>}
            </li>
          ))}
          {today.length === 0 && <li className="py-4 text-sm text-ink-soft">Nobody yet. Doors open soon.</li>}
        </ul>
      </section>
    </div>
  );
}
